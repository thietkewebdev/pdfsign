//! PKCS#11 operations: slots, certificates, PIN login, RSA PKCS#1 v1.5 signing of a SHA-256 digest.

use crate::error::{ErrorCode, Result, TokenError};
use cryptoki::context::{CInitializeArgs, CInitializeFlags, Pkcs11};
use cryptoki::error::{Error as CkError, RvError};
use cryptoki::mechanism::{Mechanism, MechanismType};
use cryptoki::object::{Attribute, AttributeType, KeyType, ObjectClass, ObjectHandle};
use cryptoki::session::{Session, UserType};
use cryptoki::slot::Slot;
use cryptoki::types::AuthPin;
use pdfsign_core::{summarize, CertSummary, RawSigner};
use secrecy::ExposeSecret;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// `PDFSIGN_PKCS11_MECHANISM=sha256-rsa-pkcs` forces hash-on-token (diagnostics and tests).
fn forced_mechanism() -> Option<SignMechanism> {
    match std::env::var("PDFSIGN_PKCS11_MECHANISM").ok()?.as_str() {
        "sha256-rsa-pkcs" => Some(SignMechanism::Sha256RsaPkcs),
        "rsa-pkcs" => Some(SignMechanism::RsaPkcsDigestInfo),
        _ => None,
    }
}

/// DER prefix of DigestInfo{ sha256, NULL } (RFC 8017 section 9.2 note 1).
const SHA256_DIGEST_INFO_PREFIX: [u8; 19] = [
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
    0x00, 0x04, 0x20,
];

pub struct Module {
    ctx: Pkcs11,
    path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotSummary {
    /// Index among slots that have a reachable token (what `--slot` refers to).
    pub index: usize,
    pub slot_id: u64,
    pub label: String,
    pub manufacturer: String,
    pub model: String,
    pub serial: String,
    pub pin_count_low: bool,
    pub pin_final_try: bool,
    pub pin_locked: bool,
}

#[derive(Debug, Clone)]
pub struct TokenCert {
    pub index: usize,
    pub der: Vec<u8>,
    pub id: Option<Vec<u8>>,
    pub label: String,
    pub summary: CertSummary,
}

#[derive(Debug, Clone)]
pub enum CertSelector {
    Index(usize),
    /// Uppercase hex serial, as printed by `list-certs`.
    Serial(String),
}

impl std::str::FromStr for CertSelector {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, String> {
        if let Some(serial) = s.strip_prefix("serial:") {
            return Ok(CertSelector::Serial(serial.trim().to_uppercase()));
        }
        s.parse::<usize>()
            .map(CertSelector::Index)
            .map_err(|_| format!("cert must be an index or serial:<HEX>, got {s}"))
    }
}

fn normalize_id(id: &[u8]) -> &[u8] {
    let end = id.iter().rposition(|b| *b != 0).map(|i| i + 1).unwrap_or(0);
    &id[..end]
}

impl Module {
    pub fn load(path: &Path) -> Result<Self> {
        let ctx = Pkcs11::new(path).map_err(|e| {
            TokenError::new(ErrorCode::NoPkcs11Dll, format!("{}: {e}", path.display()))
        })?;
        match ctx.initialize(CInitializeArgs::new(CInitializeFlags::OS_LOCKING_OK)) {
            Ok(()) | Err(CkError::Pkcs11(RvError::CryptokiAlreadyInitialized, _)) => {}
            Err(e) => return Err(e.into()),
        }
        Ok(Self {
            ctx,
            path: path.to_path_buf(),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Slots whose token answers C_GetTokenInfo and is initialized. Uses all slots, not only
    /// "token present": some drivers (e.g. Viettel) omit CKF_TOKEN_PRESENT (see cert_selector.py).
    pub fn token_slots(&self) -> Result<Vec<(Slot, SlotSummary)>> {
        let mut out = Vec::new();
        for slot in self.ctx.get_all_slots()? {
            if let Ok(info) = self.ctx.get_token_info(slot) {
                if !info.token_initialized() {
                    continue;
                }
                let index = out.len();
                out.push((
                    slot,
                    SlotSummary {
                        index,
                        slot_id: slot.id(),
                        label: info.label().trim().to_string(),
                        manufacturer: info.manufacturer_id().trim().to_string(),
                        model: info.model().trim().to_string(),
                        serial: info.serial_number().trim().to_string(),
                        pin_count_low: info.user_pin_count_low(),
                        pin_final_try: info.user_pin_final_try(),
                        pin_locked: info.user_pin_locked(),
                    },
                ));
            }
        }
        Ok(out)
    }

    /// Slot by index; also returns its summary so callers can check the PIN-retry flags.
    pub fn slot(&self, index: usize) -> Result<(Slot, SlotSummary)> {
        let slots = self.token_slots()?;
        if slots.is_empty() {
            return Err(TokenError::new(
                ErrorCode::TokenNotFound,
                format!("no token via {}", self.path.display()),
            ));
        }
        slots.into_iter().nth(index).ok_or_else(|| {
            TokenError::new(
                ErrorCode::TokenNotFound,
                format!("slot index {index} out of range"),
            )
        })
    }

    fn open_session(&self, slot_index: usize, pin: Option<&AuthPin>) -> Result<Session> {
        let (slot, summary) = self.slot(slot_index)?;
        if pin.is_some() && summary.pin_locked {
            return Err(TokenError::new(
                ErrorCode::PinLocked,
                "token reports CKF_USER_PIN_LOCKED",
            ));
        }
        let session = self.ctx.open_ro_session(slot)?;
        if let Some(pin) = pin {
            match session.login(UserType::User, Some(pin)) {
                Ok(()) | Err(CkError::Pkcs11(RvError::UserAlreadyLoggedIn, _)) => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(session)
    }

    /// List X.509 certificates. Many tokens expose certs without login; pass a PIN otherwise.
    pub fn list_certs(&self, slot_index: usize, pin: Option<&AuthPin>) -> Result<Vec<TokenCert>> {
        let session = self.open_session(slot_index, pin)?;
        let certs = read_certs(&session)?;
        if certs.is_empty() {
            return Err(TokenError::new(
                ErrorCode::NoCerts,
                "token has no X.509 certificate objects",
            ));
        }
        Ok(certs)
    }

    /// Log in and bind the private key for `selector`. The session stays open inside the signer.
    pub fn signer(
        &self,
        slot_index: usize,
        pin: &AuthPin,
        selector: &CertSelector,
    ) -> Result<TokenSigner> {
        let (slot, _) = self.slot(slot_index)?;
        let session = self.open_session(slot_index, Some(pin))?;
        let certs = read_certs(&session)?;
        if certs.is_empty() {
            return Err(TokenError::new(
                ErrorCode::NoCerts,
                "token has no X.509 certificate objects",
            ));
        }
        let cert = match selector {
            CertSelector::Index(i) => certs.get(*i).cloned(),
            CertSelector::Serial(s) => certs
                .iter()
                .find(|c| c.summary.serial.eq_ignore_ascii_case(s))
                .cloned(),
        }
        .ok_or_else(|| {
            TokenError::new(
                ErrorCode::NoCerts,
                format!("certificate {selector:?} not found"),
            )
        })?;
        if cert.summary.is_ca {
            return Err(TokenError::new(
                ErrorCode::NoCerts,
                "selected certificate is a CA certificate, not a signing certificate",
            ));
        }
        if !cert.summary.is_rsa {
            return Err(TokenError::new(
                ErrorCode::General,
                "only RSA certificates are supported in phase 1",
            ));
        }
        let now = chrono::Utc::now();
        if now > cert.summary.valid_to && std::env::var("PDFSIGN_ALLOW_EXPIRED").is_err() {
            return Err(TokenError::new(
                ErrorCode::CertExpired,
                cert.summary.valid_to.to_rfc3339(),
            ));
        }
        if now < cert.summary.valid_from && std::env::var("PDFSIGN_ALLOW_EXPIRED").is_err() {
            return Err(TokenError::new(
                ErrorCode::CertNotYetValid,
                cert.summary.valid_from.to_rfc3339(),
            ));
        }
        let key = find_private_key(&session, &cert)?;
        // Token CA certs first, then the OS store (where CA drivers install intermediates).
        let mut pool: Vec<Vec<u8>> = certs.iter().map(|c| c.der.clone()).collect();
        pool.extend(crate::syscerts::system_ca_certs());
        let chain = pdfsign_core::complete_chain(&cert.der, &pool);
        // get_mechanism_list() makes cryptoki log every vendor mechanism it does not know;
        // probing the two mechanisms we can use is quieter and sufficient.
        let has = |m: MechanismType| self.ctx.get_mechanism_info(slot, m).is_ok();
        let mechanism = if forced_mechanism() == Some(SignMechanism::Sha256RsaPkcs)
            || (!has(MechanismType::RSA_PKCS) && has(MechanismType::SHA256_RSA_PKCS))
        {
            SignMechanism::Sha256RsaPkcs
        } else {
            SignMechanism::RsaPkcsDigestInfo
        };
        let always_auth = session
            .get_attributes(key, &[AttributeType::AlwaysAuthenticate])
            .ok()
            .is_some_and(|a| {
                a.iter()
                    .any(|x| matches!(x, Attribute::AlwaysAuthenticate(true)))
            });
        let context_pin = always_auth.then(|| AuthPin::from(pin.expose_secret().to_string()));
        Ok(TokenSigner {
            session,
            key,
            cert,
            chain,
            mechanism,
            context_pin,
        })
    }
}

fn read_certs(session: &Session) -> Result<Vec<TokenCert>> {
    let handles = session.find_objects(&[Attribute::Class(ObjectClass::CERTIFICATE)])?;
    let mut out = Vec::new();
    for h in handles {
        let attrs = session.get_attributes(
            h,
            &[
                AttributeType::Value,
                AttributeType::Id,
                AttributeType::Label,
            ],
        )?;
        let (mut der, mut id, mut label) = (None, None, String::new());
        for a in attrs {
            match a {
                Attribute::Value(v) => der = Some(v),
                Attribute::Id(v) => id = Some(v),
                Attribute::Label(v) => {
                    label = String::from_utf8_lossy(&v)
                        .trim_end_matches('\0')
                        .to_string()
                }
                _ => {}
            }
        }
        let Some(der) = der else { continue };
        let Ok(summary) = summarize(&der) else {
            continue;
        };
        out.push(TokenCert {
            index: 0,
            der,
            id,
            label,
            summary,
        });
    }
    // C_FindObjects order is not stable across sessions (SoftHSM2 changes it after login), so
    // indices must come from a deterministic sort: end-entity certs first, then by expiry/serial.
    out.sort_by(|a, b| {
        (
            a.summary.is_ca,
            std::cmp::Reverse(a.summary.valid_to),
            &a.summary.serial,
        )
            .cmp(&(
                b.summary.is_ca,
                std::cmp::Reverse(b.summary.valid_to),
                &b.summary.serial,
            ))
    });
    for (i, c) in out.iter_mut().enumerate() {
        c.index = i;
    }
    Ok(out)
}

fn trim_zeros(v: &[u8]) -> &[u8] {
    let start = v.iter().position(|b| *b != 0).unwrap_or(v.len());
    &v[start..]
}

/// Pick the private key for `cert`. First by RSA modulus (CKA_MODULUS == certificate modulus),
/// then the rules of `_private_key_objects_for_cert` / `_find_matching_key` in pades_signer.py
/// (CKA_ID ignoring trailing NULs, label, only key, same index), but never a key whose modulus
/// is known to differ: that would produce a signature that does not match the embedded cert.
fn find_private_key(session: &Session, cert: &TokenCert) -> Result<ObjectHandle> {
    let keys = session.find_objects(&[Attribute::Class(ObjectClass::PRIVATE_KEY)])?;
    let mut infos = Vec::new();
    for k in keys {
        let attrs = session.get_attributes(
            k,
            &[
                AttributeType::Id,
                AttributeType::Label,
                AttributeType::KeyType,
            ],
        )?;
        let (mut id, mut label, mut kt) = (None, String::new(), None);
        for a in attrs {
            match a {
                Attribute::Id(v) => id = Some(v),
                Attribute::Label(v) => {
                    label = String::from_utf8_lossy(&v)
                        .trim_end_matches('\0')
                        .to_string()
                }
                Attribute::KeyType(t) => kt = Some(t),
                _ => {}
            }
        }
        let modulus = session
            .get_attributes(k, &[AttributeType::Modulus])
            .ok()
            .and_then(|attrs| {
                attrs.into_iter().find_map(|a| match a {
                    Attribute::Modulus(m) => Some(trim_zeros(&m).to_vec()),
                    _ => None,
                })
            })
            .filter(|m| !m.is_empty());
        infos.push((k, id, label, kt, modulus));
    }
    let cert_modulus = cert.summary.rsa_modulus.as_deref().map(trim_zeros);
    if let Some(cm) = cert_modulus {
        if let Some((k, ..)) = infos.iter().find(|(.., m)| m.as_deref() == Some(cm)) {
            return Ok(*k);
        }
    }
    let pool: Vec<_> = infos
        .iter()
        .filter(|(_, _, _, kt, _)| kt.is_none() || *kt == Some(KeyType::RSA))
        .filter(|(.., m)| m.is_none() || cert_modulus.is_none())
        .collect();

    if let Some(cid) = cert
        .id
        .as_deref()
        .map(normalize_id)
        .filter(|c| !c.is_empty())
    {
        if let Some((k, ..)) = pool
            .iter()
            .find(|(_, id, ..)| id.as_deref().map(normalize_id) == Some(cid))
        {
            return Ok(*k);
        }
    }
    if !cert.label.is_empty() {
        if let Some((k, ..)) = pool.iter().find(|(_, _, l, ..)| *l == cert.label) {
            return Ok(*k);
        }
    }
    if pool.len() == 1 {
        return Ok(pool[0].0);
    }
    if let Some((k, ..)) = pool.get(cert.index) {
        return Ok(*k);
    }
    Err(TokenError::new(
        ErrorCode::General,
        "no private key matches the selected certificate (modulus/CKA_ID/label)",
    ))
}

/// How the RSA signature is produced on the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignMechanism {
    /// CKM_RSA_PKCS over a DER DigestInfo (hash computed on the host). Preferred.
    RsaPkcsDigestInfo,
    /// CKM_SHA256_RSA_PKCS over the message (hash computed on the token).
    Sha256RsaPkcs,
}

pub struct TokenSigner {
    session: Session,
    key: ObjectHandle,
    cert: TokenCert,
    chain: Vec<Vec<u8>>,
    mechanism: SignMechanism,
    /// Only kept for keys with CKA_ALWAYS_AUTHENTICATE, which need a context-specific login per signature.
    context_pin: Option<AuthPin>,
}

impl TokenSigner {
    pub fn cert(&self) -> &TokenCert {
        &self.cert
    }

    pub fn mechanism(&self) -> SignMechanism {
        self.mechanism
    }

    fn context_login(&self) -> std::result::Result<(), String> {
        if let Some(pin) = &self.context_pin {
            self.session
                .login(UserType::ContextSpecific, Some(pin))
                .map_err(err_string)?;
        }
        Ok(())
    }

    fn sign_with(
        &self,
        mech: SignMechanism,
        message: &[u8],
    ) -> std::result::Result<Vec<u8>, CkError> {
        let (mechanism, data) = match mech {
            SignMechanism::RsaPkcsDigestInfo => {
                let digest = pdfsign_core::cades::sha256(message);
                let mut di = SHA256_DIGEST_INFO_PREFIX.to_vec();
                di.extend_from_slice(&digest);
                (Mechanism::RsaPkcs, di)
            }
            SignMechanism::Sha256RsaPkcs => (Mechanism::Sha256RsaPkcs, message.to_vec()),
        };
        self.session.sign(&mechanism, self.key, &data)
    }
}

fn err_string(e: CkError) -> String {
    let te: TokenError = e.into();
    format!("{}: {}", te.code.as_str(), te.detail)
}

fn is_mechanism_unsupported(e: &CkError) -> bool {
    matches!(
        e,
        CkError::Pkcs11(
            RvError::MechanismInvalid
                | RvError::MechanismParamInvalid
                | RvError::FunctionNotSupported
                | RvError::KeyFunctionNotPermitted
                | RvError::KeyTypeInconsistent,
            _
        )
    )
}

impl RawSigner for TokenSigner {
    fn certificate_der(&self) -> Vec<u8> {
        self.cert.der.clone()
    }

    fn chain_der(&self) -> Vec<Vec<u8>> {
        self.chain.clone()
    }

    fn sign_sha256_digest(&mut self, digest: &[u8; 32]) -> std::result::Result<Vec<u8>, String> {
        self.context_login()?;
        let mut digest_info = SHA256_DIGEST_INFO_PREFIX.to_vec();
        digest_info.extend_from_slice(digest);
        self.session
            .sign(&Mechanism::RsaPkcs, self.key, &digest_info)
            .map_err(err_string)
    }

    fn sign_sha256_message(&mut self, message: &[u8]) -> std::result::Result<Vec<u8>, String> {
        self.context_login()?;
        match self.sign_with(self.mechanism, message) {
            Ok(sig) => Ok(sig),
            Err(e) if is_mechanism_unsupported(&e) => {
                let other = match self.mechanism {
                    SignMechanism::RsaPkcsDigestInfo => SignMechanism::Sha256RsaPkcs,
                    SignMechanism::Sha256RsaPkcs => SignMechanism::RsaPkcsDigestInfo,
                };
                self.context_login()?;
                let sig = self.sign_with(other, message).map_err(err_string)?;
                self.mechanism = other;
                Ok(sig)
            }
            Err(e) => Err(err_string(e)),
        }
    }
}

impl Drop for TokenSigner {
    fn drop(&mut self) {
        let _ = self.session.logout();
    }
}
