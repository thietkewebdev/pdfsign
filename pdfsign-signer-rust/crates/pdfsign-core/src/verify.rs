//! Signature verification for the Verify tab and the CLI.
//!
//! Checks per signature: ByteRange digest, signature value, certificate chain (built from the CMS,
//! the DSS and optional trust anchors, each link's signature checked), validity at signing time,
//! revocation data embedded in the DSS (OCSP signature and CRL signature checked), timestamps
//! (signature timestamp and document timestamps), and the resulting PAdES level.
//! Trust is only asserted against anchors supplied by the caller; there is no OS trust store here.

use crate::cades::{
    OID_CMS_ALGORITHM_PROTECTION, OID_SIGNATURE_TIME_STAMP_TOKEN, OID_SIGNING_CERTIFICATE_V2,
};
use crate::certinfo::summarize;
use crate::error::{Error, Result};
use chrono::{DateTime, Utc};
use cms::content_info::ContentInfo;
use cms::signed_data::{SignerIdentifier, SignerInfo};
use const_oid::db::rfc5911::ID_MESSAGE_DIGEST;
use const_oid::ObjectIdentifier;
use der::asn1::OctetString;
use der::{Any, Decode, Encode, Reader, SliceReader, Tag, Tagged};
use lopdf::{Dictionary, Document, Object};
use rsa::pkcs1v15::Pkcs1v15Sign;
use rsa::pkcs8::DecodePublicKey;
use rsa::RsaPublicKey;
use sha2::Digest;
use x509_cert::Certificate;
use x509_ocsp::{BasicOcspResponse, CertStatus, OcspResponse};
use x509_tsp::TstInfo;

const OID_SHA1: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.14.3.2.26");
const OID_SHA256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");
const OID_SHA384: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.2");
const OID_SHA512: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.3");
const OID_SHA1_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.5");
const OID_SHA256_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.11");
const OID_SHA384_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.12");
const OID_SHA512_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.13");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureKindReport {
    Signature,
    DocTimeStamp,
}

#[derive(Debug, Clone)]
pub struct RevocationStatus {
    pub subject: String,
    /// "OCSP", "CRL" or "none".
    pub source: String,
    /// "good", "revoked" or "unknown".
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct SignatureReport {
    pub field_name: String,
    pub kind: SignatureKindReport,
    pub sub_filter: String,
    pub signer_cn: Option<String>,
    pub signer_name: Option<String>,
    pub issuer_cn: Option<String>,
    pub serial: Option<String>,
    pub byte_range: Vec<i64>,
    pub covers_whole_file: bool,
    pub digest_ok: bool,
    pub signature_ok: bool,
    pub has_signing_certificate_v2: bool,
    pub has_algorithm_protection: bool,
    pub has_timestamp: bool,
    pub timestamp_ok: Option<bool>,
    /// Signer-claimed time (/M), RFC 3339.
    pub claimed_time: Option<String>,
    /// Time from the signature timestamp or document timestamp, RFC 3339.
    pub timestamp_time: Option<String>,
    pub signed_attribute_oids: Vec<String>,
    /// Subject CNs from the signer up to the last certificate found.
    pub chain: Vec<String>,
    pub chain_complete: bool,
    pub chain_signatures_ok: bool,
    pub cert_valid_at_signing: bool,
    /// `Some(true)` when the chain ends at a caller-supplied trust anchor; `None` when no anchors given.
    pub trusted: Option<bool>,
    pub revocation: Vec<RevocationStatus>,
    pub dss_present: bool,
    /// Every non-root certificate (signer chain and timestamp chain) has embedded OCSP/CRL.
    pub ltv: bool,
    /// "B-B", "B-T", "B-LT", "B-LTA", or "CMS" for non-PAdES (adbe.pkcs7.detached) signatures.
    pub level: String,
    /// Set when the signature could not be parsed.
    pub error: Option<String>,
}

impl SignatureReport {
    pub fn is_intact(&self) -> bool {
        self.digest_ok && self.signature_ok
    }

    fn failed(
        name: String,
        kind: SignatureKindReport,
        sub_filter: String,
        byte_range: Vec<i64>,
        e: Error,
    ) -> Self {
        SignatureReport {
            field_name: name,
            kind,
            sub_filter,
            signer_cn: None,
            signer_name: None,
            issuer_cn: None,
            serial: None,
            byte_range,
            covers_whole_file: false,
            digest_ok: false,
            signature_ok: false,
            has_signing_certificate_v2: false,
            has_algorithm_protection: false,
            has_timestamp: false,
            timestamp_ok: None,
            claimed_time: None,
            timestamp_time: None,
            signed_attribute_oids: Vec::new(),
            chain: Vec::new(),
            chain_complete: false,
            chain_signatures_ok: false,
            cert_valid_at_signing: false,
            trusted: None,
            revocation: Vec::new(),
            dss_present: false,
            ltv: false,
            level: String::new(),
            error: Some(e.to_string()),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct VerifyOptions {
    /// DER trust anchors (root CAs) the user trusts.
    pub trust_anchors: Vec<Vec<u8>>,
}

/// CMS SignedData read element by element, tolerating non-DER details seen in the wild
/// (e.g. duplicate certificates in the SET, which strict DER decoding rejects).
struct ParsedCms {
    certs: Vec<Certificate>,
    signer_infos: Vec<SignerInfo>,
    econtent: Option<Vec<u8>>,
}

fn parse_cms(bytes: &[u8]) -> Result<ParsedCms> {
    let mut r = SliceReader::new(bytes)?;
    let ci = ContentInfo::decode(&mut r)?;
    let mut sd = SliceReader::new(ci.content.value())?;
    let mut out = ParsedCms {
        certs: Vec::new(),
        signer_infos: Vec::new(),
        econtent: None,
    };
    let mut seen_sets = 0;
    while !sd.is_finished() {
        let el = Any::decode(&mut sd)?;
        match el.tag() {
            Tag::Set => {
                seen_sets += 1;
                if seen_sets == 2 {
                    let mut sr = SliceReader::new(el.value())?;
                    while !sr.is_finished() {
                        out.signer_infos.push(SignerInfo::decode(&mut sr)?);
                    }
                }
            }
            Tag::Sequence => {
                let eci = cms::signed_data::EncapsulatedContentInfo::from_der(&el.to_der()?)?;
                if let Some(c) = eci.econtent {
                    out.econtent = Some(OctetString::from_der(&c.to_der()?)?.as_bytes().to_vec());
                }
            }
            Tag::ContextSpecific { number, .. } if number.value() == 0 => {
                let mut cr = SliceReader::new(el.value())?;
                while !cr.is_finished() {
                    let any = Any::decode(&mut cr)?;
                    if let Ok(c) = Certificate::from_der(&any.to_der()?) {
                        if !out.certs.contains(&c) {
                            out.certs.push(c);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

fn hash(oid: ObjectIdentifier, data: &[u8]) -> Option<Vec<u8>> {
    Some(match oid {
        OID_SHA1 => sha1::Sha1::digest(data).to_vec(),
        OID_SHA256 => sha2::Sha256::digest(data).to_vec(),
        OID_SHA384 => sha2::Sha384::digest(data).to_vec(),
        OID_SHA512 => sha2::Sha512::digest(data).to_vec(),
        _ => return None,
    })
}

/// RSA PKCS#1 v1.5 verification of a precomputed digest.
fn rsa_verify(cert: &Certificate, digest_oid: ObjectIdentifier, digest: &[u8], sig: &[u8]) -> bool {
    let Ok(spki) = cert.tbs_certificate.subject_public_key_info.to_der() else {
        return false;
    };
    let Ok(pk) = RsaPublicKey::from_public_key_der(&spki) else {
        return false;
    };
    let scheme = match digest_oid {
        OID_SHA1 => Pkcs1v15Sign::new::<sha1::Sha1>(),
        OID_SHA256 => Pkcs1v15Sign::new::<sha2::Sha256>(),
        OID_SHA384 => Pkcs1v15Sign::new::<sha2::Sha384>(),
        OID_SHA512 => Pkcs1v15Sign::new::<sha2::Sha512>(),
        _ => return false,
    };
    pk.verify(scheme, digest, sig).is_ok()
}

fn sig_alg_digest(oid: ObjectIdentifier) -> Option<ObjectIdentifier> {
    Some(match oid {
        OID_SHA1_RSA => OID_SHA1,
        OID_SHA256_RSA => OID_SHA256,
        OID_SHA384_RSA => OID_SHA384,
        OID_SHA512_RSA => OID_SHA512,
        _ => return None,
    })
}

/// Verify `signed`'s signature (tbs DER + algorithm + bits) with `issuer`'s key.
fn verify_signed(issuer: &Certificate, tbs: &[u8], alg: ObjectIdentifier, sig: &[u8]) -> bool {
    let Some(d) = sig_alg_digest(alg) else {
        return false;
    };
    let Some(h) = hash(d, tbs) else { return false };
    rsa_verify(issuer, d, &h, sig)
}

/// True when `issuer` has `child`'s issuer name as subject and its key verifies `child`'s signature.
pub fn cert_issued_by(child: &Certificate, issuer: &Certificate) -> bool {
    child.tbs_certificate.issuer == issuer.tbs_certificate.subject
        && child.tbs_certificate.to_der().is_ok_and(|tbs| {
            verify_signed(
                issuer,
                &tbs,
                child.signature_algorithm.oid,
                child.signature.raw_bytes(),
            )
        })
}

fn cn(c: &Certificate) -> String {
    crate::certinfo::name_attr(
        &c.tbs_certificate.subject,
        ObjectIdentifier::new_unwrap("2.5.4.3"),
    )
    .unwrap_or_else(|| c.tbs_certificate.subject.to_string())
}

fn signer_cert<'a>(si: &SignerInfo, certs: &'a [Certificate]) -> Option<&'a Certificate> {
    certs.iter().find(|c| match &si.sid {
        SignerIdentifier::IssuerAndSerialNumber(ias) => {
            c.tbs_certificate.serial_number == ias.serial_number
                && c.tbs_certificate.issuer == ias.issuer
        }
        SignerIdentifier::SubjectKeyIdentifier(_) => false,
    })
}

/// Check message-digest and the signature over signed attributes. Returns (digest_ok, sig_ok).
fn check_signer_info(si: &SignerInfo, cert: &Certificate, content: &[u8]) -> (bool, bool) {
    let digest_oid = si.digest_alg.oid;
    let Some(content_digest) = hash(digest_oid, content) else {
        return (false, false);
    };
    match &si.signed_attrs {
        Some(attrs) => {
            let md = attrs
                .iter()
                .find(|a| a.oid == ID_MESSAGE_DIGEST)
                .and_then(|a| a.values.iter().next())
                .and_then(|v| v.decode_as::<OctetString>().ok());
            let digest_ok = md.is_some_and(|m| m.as_bytes() == content_digest.as_slice());
            let sig_ok = attrs
                .to_der()
                .ok()
                .and_then(|der| hash(digest_oid, &der))
                .is_some_and(|h| rsa_verify(cert, digest_oid, &h, si.signature.as_bytes()));
            (digest_ok, sig_ok)
        }
        None => (
            true,
            rsa_verify(cert, digest_oid, &content_digest, si.signature.as_bytes()),
        ),
    }
}

/// Parse and check an RFC 3161 token against `imprint_data`. Returns (ok, genTime, certs).
fn check_timestamp(
    token: &[u8],
    imprint_data: &[u8],
) -> (bool, Option<DateTime<Utc>>, Vec<Certificate>) {
    let Ok(cms) = parse_cms(token) else {
        return (false, None, Vec::new());
    };
    let Some(econtent) = cms.econtent.clone() else {
        return (false, None, cms.certs);
    };
    let Ok(tst) = TstInfo::from_der(&econtent) else {
        return (false, None, cms.certs);
    };
    let gen = DateTime::<Utc>::from_timestamp(tst.gen_time.to_unix_duration().as_secs() as i64, 0);
    let imprint_ok = hash(tst.message_imprint.hash_algorithm.oid, imprint_data)
        .is_some_and(|h| h == tst.message_imprint.hashed_message.as_bytes());
    let sig_ok = cms.signer_infos.first().is_some_and(|si| {
        signer_cert(si, &cms.certs).is_some_and(|c| {
            let (d, s) = check_signer_info(si, c, &econtent);
            d && s
        })
    });
    (imprint_ok && sig_ok, gen, cms.certs)
}

struct Dss {
    certs: Vec<Certificate>,
    ocsps: Vec<Vec<u8>>,
    crls: Vec<x509_cert::crl::CertificateList>,
}

fn stream_bytes(doc: &Document, o: &Object) -> Option<Vec<u8>> {
    let id = o.as_reference().ok()?;
    let s = doc.get_object(id).ok()?.as_stream().ok()?;
    s.decompressed_content()
        .ok()
        .or_else(|| Some(s.content.clone()))
}

fn read_dss(doc: &Document) -> Option<Dss> {
    let root = doc.trailer.get(b"Root").ok()?.as_reference().ok()?;
    let catalog = doc.get_dictionary(root).ok()?;
    let dss: &Dictionary = match catalog.get(b"DSS").ok()? {
        Object::Reference(id) => doc.get_dictionary(*id).ok()?,
        Object::Dictionary(d) => d,
        _ => return None,
    };
    let items = |key: &[u8]| -> Vec<Vec<u8>> {
        let arr = match dss.get(key) {
            Ok(Object::Array(a)) => a.clone(),
            Ok(Object::Reference(id)) => doc
                .get_object(*id)
                .ok()
                .and_then(|o| o.as_array().ok())
                .cloned()
                .unwrap_or_default(),
            _ => Vec::new(),
        };
        arr.iter().filter_map(|o| stream_bytes(doc, o)).collect()
    };
    Some(Dss {
        certs: items(b"Certs")
            .iter()
            .filter_map(|c| Certificate::from_der(c).ok())
            .collect(),
        ocsps: items(b"OCSPs"),
        crls: items(b"CRLs")
            .iter()
            .filter_map(|c| x509_cert::crl::CertificateList::from_der(c).ok())
            .collect(),
    })
}

fn build_chain(start: &Certificate, pool: &[Certificate]) -> (Vec<Certificate>, bool, bool) {
    let mut chain = vec![start.clone()];
    let mut sigs_ok = true;
    for _ in 0..10 {
        let cur = chain.last().expect("non-empty").clone();
        if cur.tbs_certificate.subject == cur.tbs_certificate.issuer {
            sigs_ok &= cert_issued_by(&cur, &cur);
            return (chain, true, sigs_ok);
        }
        match pool.iter().find(|c| cert_issued_by(&cur, c)) {
            Some(issuer) => chain.push(issuer.clone()),
            None => {
                sigs_ok = sigs_ok
                    && pool
                        .iter()
                        .any(|c| c.tbs_certificate.subject == cur.tbs_certificate.issuer);
                return (chain, false, sigs_ok);
            }
        }
    }
    (chain, false, sigs_ok)
}

fn revocation_for(
    cert: &Certificate,
    issuer: &Certificate,
    dss: &Dss,
    pool: &[Certificate],
) -> RevocationStatus {
    let subject = cn(cert);
    for raw in &dss.ocsps {
        let Ok(resp) = OcspResponse::from_der(raw) else {
            continue;
        };
        let Some(bytes) = resp.response_bytes else {
            continue;
        };
        let Ok(basic) = BasicOcspResponse::from_der(bytes.response.as_bytes()) else {
            continue;
        };
        let Some(single) = basic
            .tbs_response_data
            .responses
            .iter()
            .find(|s| s.cert_id.serial_number == cert.tbs_certificate.serial_number)
        else {
            continue;
        };
        let Ok(tbs) = basic.tbs_response_data.to_der() else {
            continue;
        };
        let responders: Vec<Certificate> = basic
            .certs
            .clone()
            .unwrap_or_default()
            .into_iter()
            .chain([issuer.clone()])
            .chain(pool.iter().cloned())
            .collect();
        let signed = responders.iter().any(|r| {
            verify_signed(
                r,
                &tbs,
                basic.signature_algorithm.oid,
                basic.signature.raw_bytes(),
            )
        });
        if !signed {
            continue;
        }
        let status = match single.cert_status {
            CertStatus::Good(_) => "good",
            CertStatus::Revoked(_) => "revoked",
            CertStatus::Unknown(_) => "unknown",
        };
        return RevocationStatus {
            subject,
            source: "OCSP".into(),
            status: status.into(),
        };
    }
    for crl in &dss.crls {
        if crl.tbs_cert_list.issuer != cert.tbs_certificate.issuer {
            continue;
        }
        let Ok(tbs) = crl.tbs_cert_list.to_der() else {
            continue;
        };
        if !verify_signed(
            issuer,
            &tbs,
            crl.signature_algorithm.oid,
            crl.signature.raw_bytes(),
        ) {
            continue;
        }
        let revoked = crl
            .tbs_cert_list
            .revoked_certificates
            .iter()
            .flatten()
            .any(|r| r.serial_number == cert.tbs_certificate.serial_number);
        return RevocationStatus {
            subject,
            source: "CRL".into(),
            status: if revoked { "revoked" } else { "good" }.into(),
        };
    }
    RevocationStatus {
        subject,
        source: "none".into(),
        status: "unknown".into(),
    }
}

fn valid_at(c: &Certificate, t: DateTime<Utc>) -> bool {
    let nb = c
        .tbs_certificate
        .validity
        .not_before
        .to_unix_duration()
        .as_secs() as i64;
    let na = c
        .tbs_certificate
        .validity
        .not_after
        .to_unix_duration()
        .as_secs() as i64;
    (nb..=na).contains(&t.timestamp())
}

fn decode_text(s: &[u8]) -> String {
    if s.starts_with(&[0xFE, 0xFF]) {
        let u: Vec<u16> = s[2..]
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u)
    } else {
        String::from_utf8_lossy(s).into_owned()
    }
}

fn parse_pdf_date(s: &str) -> Option<DateTime<Utc>> {
    let s = s.trim_start_matches("D:");
    let digits: String = s.chars().take(14).collect();
    let base =
        chrono::NaiveDateTime::parse_from_str(&format!("{digits:0<14}"), "%Y%m%d%H%M%S").ok()?;
    let rest = &s[digits.len().min(s.len())..];
    let offset = match rest.chars().next() {
        Some(c @ ('+' | '-')) => {
            let nums: String = rest[1..].chars().filter(|c| c.is_ascii_digit()).collect();
            let h: i64 = nums.get(0..2).and_then(|v| v.parse().ok()).unwrap_or(0);
            let m: i64 = nums.get(2..4).and_then(|v| v.parse().ok()).unwrap_or(0);
            let secs = h * 3600 + m * 60;
            if c == '+' {
                secs
            } else {
                -secs
            }
        }
        _ => 0,
    };
    Some(DateTime::<Utc>::from_naive_utc_and_offset(base, Utc) - chrono::Duration::seconds(offset))
}

pub fn verify_pdf(data: &[u8]) -> Result<Vec<SignatureReport>> {
    verify_pdf_with(data, &VerifyOptions::default())
}

pub fn verify_pdf_with(data: &[u8], opts: &VerifyOptions) -> Result<Vec<SignatureReport>> {
    let doc = Document::load_mem(data)?;
    let dss = read_dss(&doc);
    let anchors: Vec<Certificate> = opts
        .trust_anchors
        .iter()
        .filter_map(|a| Certificate::from_der(a).ok())
        .collect();
    let mut reports = Vec::new();
    for obj in doc.objects.values() {
        let Ok(dict) = obj.as_dict() else { continue };
        if dict.get(b"FT").and_then(|o| o.as_name()).ok() != Some(b"Sig".as_slice()) {
            continue;
        }
        let name = match dict.get(b"T") {
            Ok(Object::String(s, _)) => decode_text(s),
            _ => String::new(),
        };
        let Ok(v) = dict.get(b"V") else { continue };
        let sig = match v {
            Object::Reference(id) => match doc.get_dictionary(*id) {
                Ok(d) => d,
                Err(_) => continue,
            },
            Object::Dictionary(d) => d,
            _ => continue,
        };
        let sub_filter = sig
            .get(b"SubFilter")
            .and_then(|o| o.as_name())
            .map(|n| String::from_utf8_lossy(n).into_owned())
            .unwrap_or_default();
        let kind = if sub_filter == "ETSI.RFC3161" {
            SignatureKindReport::DocTimeStamp
        } else {
            SignatureKindReport::Signature
        };
        let br: Vec<i64> = sig
            .get(b"ByteRange")
            .and_then(|o| o.as_array())
            .map(|a| a.iter().filter_map(|o| o.as_i64().ok()).collect())
            .unwrap_or_default();
        let report = check_one(data, &name, kind, &sub_filter, sig, dss.as_ref(), &anchors)
            .unwrap_or_else(|e| {
                SignatureReport::failed(name.clone(), kind, sub_filter.clone(), br, e)
            });
        reports.push(report);
    }
    reports.sort_by_key(|r| r.byte_range.get(1).copied().unwrap_or(0));

    // B-LTA: a valid document timestamp added after a B-LT signature.
    let dts_ends: Vec<i64> = reports
        .iter()
        .filter(|r| r.kind == SignatureKindReport::DocTimeStamp && r.timestamp_ok == Some(true))
        .map(|r| r.byte_range.get(1).copied().unwrap_or(0))
        .collect();
    for r in reports.iter_mut() {
        if r.level == "B-LT"
            && dts_ends
                .iter()
                .any(|e| *e > r.byte_range.get(1).copied().unwrap_or(0))
        {
            r.level = "B-LTA".into();
        }
    }
    Ok(reports)
}

fn check_one(
    data: &[u8],
    name: &str,
    kind: SignatureKindReport,
    sub_filter: &str,
    sig: &Dictionary,
    dss: Option<&Dss>,
    anchors: &[Certificate],
) -> Result<SignatureReport> {
    let br: Vec<i64> = sig
        .get(b"ByteRange")?
        .as_array()?
        .iter()
        .filter_map(|o| o.as_i64().ok())
        .collect();
    if br.len() != 4 || br.iter().any(|v| *v < 0) {
        return Err(Error::Verify("malformed ByteRange".into()));
    }
    let (a, b, c, d) = (
        br[0] as usize,
        br[1] as usize,
        br[2] as usize,
        br[3] as usize,
    );
    if a + b > data.len() || c + d > data.len() || b > c {
        return Err(Error::Verify("ByteRange outside file".into()));
    }
    let mut signed_bytes = Vec::with_capacity(b + d);
    signed_bytes.extend_from_slice(&data[a..a + b]);
    signed_bytes.extend_from_slice(&data[c..c + d]);
    let contents = match sig.get(b"Contents")? {
        Object::String(s, _) => s.clone(),
        _ => return Err(Error::Verify("no /Contents".into())),
    };
    let claimed_time = match sig.get(b"M") {
        Ok(Object::String(s, _)) => parse_pdf_date(&String::from_utf8_lossy(s)),
        _ => None,
    };
    let covers_whole_file = a == 0 && c + d == data.len();
    let empty_dss = Dss {
        certs: Vec::new(),
        ocsps: Vec::new(),
        crls: Vec::new(),
    };
    let dss_ref = dss.unwrap_or(&empty_dss);

    let (signer, cms_certs, digest_ok, signature_ok, attrs_oids, has_sc2, has_ap, ts) = match kind {
        SignatureKindReport::DocTimeStamp => {
            let (ok, gen, certs) = check_timestamp(&contents, &signed_bytes);
            let cms = parse_cms(&contents)?;
            let signer = cms
                .signer_infos
                .first()
                .and_then(|si| signer_cert(si, &cms.certs))
                .cloned();
            (
                signer,
                certs,
                ok,
                ok,
                Vec::new(),
                false,
                false,
                Some((ok, gen, Vec::new())),
            )
        }
        SignatureKindReport::Signature => {
            let cms = parse_cms(&contents)?;
            let si = cms
                .signer_infos
                .first()
                .ok_or_else(|| Error::Verify("no SignerInfo".into()))?;
            let signer = signer_cert(si, &cms.certs)
                .cloned()
                .ok_or_else(|| Error::Verify("signer certificate not embedded".into()))?;
            let (digest_ok, sig_ok) = check_signer_info(si, &signer, &signed_bytes);
            let oids: Vec<String> = si
                .signed_attrs
                .iter()
                .flat_map(|a| a.iter())
                .map(|a| a.oid.to_string())
                .collect();
            let has_sc2 = si
                .signed_attrs
                .iter()
                .flat_map(|a| a.iter())
                .any(|a| a.oid == OID_SIGNING_CERTIFICATE_V2);
            let has_ap = si
                .signed_attrs
                .iter()
                .flat_map(|a| a.iter())
                .any(|a| a.oid == OID_CMS_ALGORITHM_PROTECTION);
            let ts = si
                .unsigned_attrs
                .iter()
                .flat_map(|u| u.iter())
                .find(|a| a.oid == OID_SIGNATURE_TIME_STAMP_TOKEN)
                .and_then(|a| a.values.iter().next())
                .and_then(|v| v.to_der().ok())
                .map(|tok| {
                    let (ok, gen, certs) = check_timestamp(&tok, si.signature.as_bytes());
                    (ok, gen, certs)
                });
            (
                Some(signer),
                cms.certs,
                digest_ok,
                sig_ok,
                oids,
                has_sc2,
                has_ap,
                ts,
            )
        }
    };
    let signer = signer.ok_or_else(|| Error::Verify("signer certificate not found".into()))?;
    let (has_timestamp, timestamp_ok, ts_time, ts_certs) = match ts {
        Some((ok, gen, certs)) => (kind == SignatureKindReport::Signature, Some(ok), gen, certs),
        None => (false, None, None, Vec::new()),
    };

    let mut pool: Vec<Certificate> = cms_certs.clone();
    pool.extend(ts_certs.iter().cloned());
    pool.extend(dss_ref.certs.iter().cloned());
    pool.extend(anchors.iter().cloned());
    let (chain, chain_complete, chain_sigs_ok) = build_chain(&signer, &pool);
    let at = ts_time.or(claimed_time).unwrap_or_else(Utc::now);
    let cert_valid_at_signing = chain.iter().all(|c| valid_at(c, at));
    let trusted = (!anchors.is_empty())
        .then(|| chain_complete && chain.last().is_some_and(|root| anchors.contains(root)));

    // Revocation coverage: signer chain plus the timestamp signer's chain.
    let mut revocation = Vec::new();
    let mut ltv = dss.is_some() && chain_complete;
    let mut chains = vec![chain.clone()];
    if kind == SignatureKindReport::Signature {
        if let Some(ts_signer) = ts_certs.iter().find(|c| {
            !c.tbs_certificate.extensions.iter().flatten().any(|e| {
                e.extn_id == ObjectIdentifier::new_unwrap("2.5.29.19")
                    && e.extn_value.as_bytes().len() > 2
            })
        }) {
            let (tchain, tcomplete, _) = build_chain(ts_signer, &pool);
            ltv &= tcomplete;
            chains.push(tchain);
        }
    }
    for ch in &chains {
        for pair in ch.windows(2) {
            let st = revocation_for(&pair[0], &pair[1], dss_ref, &pool);
            if st.status != "good" {
                ltv = false;
            }
            revocation.push(st);
        }
    }
    if dss.is_none() {
        ltv = false;
    }

    let summary = summarize(&signer.to_der()?).ok();
    let level = if kind == SignatureKindReport::DocTimeStamp {
        "DocTimeStamp".to_string()
    } else if sub_filter != "ETSI.CAdES.detached" {
        "CMS".to_string()
    } else if has_timestamp && timestamp_ok == Some(true) && ltv {
        "B-LT".to_string()
    } else if has_timestamp && timestamp_ok == Some(true) {
        "B-T".to_string()
    } else {
        "B-B".to_string()
    };
    Ok(SignatureReport {
        field_name: name.to_string(),
        kind,
        sub_filter: sub_filter.to_string(),
        signer_cn: summary.as_ref().and_then(|s| s.subject_cn.clone()),
        signer_name: summary.as_ref().map(|s| s.display_name()),
        issuer_cn: summary.as_ref().and_then(|s| s.issuer_cn.clone()),
        serial: summary.as_ref().map(|s| s.serial.clone()),
        byte_range: br,
        covers_whole_file,
        digest_ok,
        signature_ok,
        has_signing_certificate_v2: has_sc2,
        has_algorithm_protection: has_ap,
        has_timestamp,
        timestamp_ok,
        claimed_time: claimed_time.map(|t| t.to_rfc3339()),
        timestamp_time: ts_time.map(|t| t.to_rfc3339()),
        signed_attribute_oids: attrs_oids,
        chain: chain.iter().map(cn).collect(),
        chain_complete,
        chain_signatures_ok: chain_sigs_ok,
        cert_valid_at_signing,
        trusted,
        revocation,
        dss_present: dss.is_some(),
        ltv,
        level,
        error: None,
    })
}
