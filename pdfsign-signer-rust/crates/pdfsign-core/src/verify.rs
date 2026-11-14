//! Cryptographic self-check of PDF signatures (integrity + signature value + structure).
//! This is not trust validation: chain building, revocation and AATL trust are out of scope.

use crate::cades::{
    OID_CMS_ALGORITHM_PROTECTION, OID_SIGNATURE_TIME_STAMP_TOKEN, OID_SIGNING_CERTIFICATE_V2,
};
use crate::certinfo::summarize;
use crate::error::{Error, Result};
use cms::cert::CertificateChoices;
use cms::content_info::ContentInfo;
use cms::signed_data::{SignedData, SignerIdentifier};
use const_oid::db::rfc5911::ID_MESSAGE_DIGEST;
use der::asn1::OctetString;
use der::{Decode, Encode, SliceReader};
use lopdf::{Document, Object};
use rsa::pkcs1v15::Pkcs1v15Sign;
use rsa::pkcs8::DecodePublicKey;
use rsa::RsaPublicKey;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct SignatureReport {
    pub field_name: String,
    pub sub_filter: String,
    pub signer_cn: Option<String>,
    pub byte_range: Vec<i64>,
    pub covers_whole_file: bool,
    pub digest_ok: bool,
    pub signature_ok: bool,
    pub has_signing_certificate_v2: bool,
    pub has_algorithm_protection: bool,
    pub has_timestamp: bool,
    pub signed_attribute_oids: Vec<String>,
    /// Set when the signature could not be parsed (e.g. non-DER CMS from another signer).
    pub error: Option<String>,
}

impl SignatureReport {
    pub fn is_intact(&self) -> bool {
        self.digest_ok && self.signature_ok
    }
}

pub fn verify_pdf(data: &[u8]) -> Result<Vec<SignatureReport>> {
    let doc = Document::load_mem(data)?;
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
            Object::Reference(id) => doc.get_dictionary(*id)?,
            Object::Dictionary(d) => d,
            _ => continue,
        };
        let report = check_one(data, &name, sig).unwrap_or_else(|e| SignatureReport {
            field_name: name.clone(),
            sub_filter: sig
                .get(b"SubFilter")
                .and_then(|o| o.as_name())
                .map(|n| String::from_utf8_lossy(n).into_owned())
                .unwrap_or_default(),
            signer_cn: None,
            byte_range: sig
                .get(b"ByteRange")
                .and_then(|o| o.as_array())
                .map(|a| a.iter().filter_map(|o| o.as_i64().ok()).collect())
                .unwrap_or_default(),
            covers_whole_file: false,
            digest_ok: false,
            signature_ok: false,
            has_signing_certificate_v2: false,
            has_algorithm_protection: false,
            has_timestamp: false,
            signed_attribute_oids: Vec::new(),
            error: Some(e.to_string()),
        });
        reports.push(report);
    }
    reports.sort_by_key(|r| r.byte_range.get(1).copied().unwrap_or(0));
    Ok(reports)
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

fn check_one(data: &[u8], name: &str, sig: &lopdf::Dictionary) -> Result<SignatureReport> {
    let sub_filter = sig
        .get(b"SubFilter")
        .and_then(|o| o.as_name())
        .map(|n| String::from_utf8_lossy(n).into_owned())
        .unwrap_or_default();
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
    let mut h = Sha256::new();
    h.update(&data[a..a + b]);
    h.update(&data[c..c + d]);
    let pdf_digest = h.finalize().to_vec();

    let contents = match sig.get(b"Contents")? {
        Object::String(s, _) => s.clone(),
        _ => return Err(Error::Verify("no /Contents".into())),
    };
    let mut reader = SliceReader::new(&contents)?;
    let ci = ContentInfo::decode(&mut reader)?;
    let sd: SignedData = ci.content.decode_as()?;
    let si = sd
        .signer_infos
        .0
        .iter()
        .next()
        .ok_or_else(|| Error::Verify("no SignerInfo".into()))?;

    let cert = sd
        .certificates
        .as_ref()
        .and_then(|cs| {
            cs.0.iter().find_map(|c| match (c, &si.sid) {
                (
                    CertificateChoices::Certificate(cert),
                    SignerIdentifier::IssuerAndSerialNumber(ias),
                ) if cert.tbs_certificate.serial_number == ias.serial_number
                    && cert.tbs_certificate.issuer == ias.issuer =>
                {
                    Some(cert.clone())
                }
                _ => None,
            })
        })
        .ok_or_else(|| Error::Verify("signer certificate not embedded".into()))?;

    let attrs = si
        .signed_attrs
        .as_ref()
        .ok_or_else(|| Error::Verify("no signed attributes".into()))?;
    let md = attrs
        .iter()
        .find(|a| a.oid == ID_MESSAGE_DIGEST)
        .and_then(|a| a.values.iter().next())
        .and_then(|v| v.decode_as::<OctetString>().ok())
        .ok_or_else(|| Error::Verify("no message-digest attribute".into()))?;
    let digest_ok = md.as_bytes() == pdf_digest.as_slice();

    let attrs_der = attrs.to_der()?;
    let attrs_digest = Sha256::digest(&attrs_der);
    let spki_der = cert.tbs_certificate.subject_public_key_info.to_der()?;
    let signature_ok = match RsaPublicKey::from_public_key_der(&spki_der) {
        Ok(pk) => pk
            .verify(
                Pkcs1v15Sign::new::<Sha256>(),
                &attrs_digest,
                si.signature.as_bytes(),
            )
            .is_ok(),
        Err(_) => false,
    };

    let cert_der = cert.to_der()?;
    Ok(SignatureReport {
        field_name: name.to_string(),
        sub_filter,
        signer_cn: summarize(&cert_der).ok().and_then(|s| s.subject_cn),
        covers_whole_file: a == 0 && c + d == data.len(),
        byte_range: br,
        digest_ok,
        signature_ok,
        has_signing_certificate_v2: attrs.iter().any(|a| a.oid == OID_SIGNING_CERTIFICATE_V2),
        has_algorithm_protection: attrs.iter().any(|a| a.oid == OID_CMS_ALGORITHM_PROTECTION),
        has_timestamp: si
            .unsigned_attrs
            .as_ref()
            .is_some_and(|u| u.iter().any(|a| a.oid == OID_SIGNATURE_TIME_STAMP_TOKEN)),
        signed_attribute_oids: attrs.iter().map(|a| a.oid.to_string()).collect(),
        error: None,
    })
}
