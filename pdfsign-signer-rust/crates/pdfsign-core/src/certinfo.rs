//! Human-readable certificate fields, matching the JSON shape of
//! `PDFSignProSignerCore.exe --list-certs` (subjectO, subjectCN, issuerCN, serial, validTo).

use crate::cades::parse_certificate;
use crate::error::Result;
use chrono::{DateTime, Utc};
use const_oid::ObjectIdentifier;
use der::{Any, Tag, Tagged};
use x509_cert::name::Name;

const OID_CN: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.4.3");
const OID_O: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.4.10");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CertSummary {
    pub subject_o: Option<String>,
    pub subject_cn: Option<String>,
    pub issuer_cn: Option<String>,
    /// Uppercase hex without leading zeros, same as Python `format(serial, "x").upper()`.
    pub serial: String,
    pub valid_from: DateTime<Utc>,
    pub valid_to: DateTime<Utc>,
    pub is_rsa: bool,
}

impl CertSummary {
    /// O if present, else CN (same rule as `get_signer_name` in cert_selector.py).
    pub fn display_name(&self) -> String {
        self.subject_o
            .clone()
            .or_else(|| self.subject_cn.clone())
            .unwrap_or_else(|| "Unknown".to_string())
    }

    pub fn is_time_valid(&self, now: DateTime<Utc>) -> bool {
        now >= self.valid_from && now <= self.valid_to
    }
}

pub fn summarize(cert_der: &[u8]) -> Result<CertSummary> {
    let cert = parse_certificate(cert_der)?;
    let tbs = &cert.tbs_certificate;
    let serial_hex = hex::encode_upper(tbs.serial_number.as_bytes());
    let serial = serial_hex.trim_start_matches('0');
    let to_utc = |t: &x509_cert::time::Time| {
        DateTime::<Utc>::from_timestamp(t.to_unix_duration().as_secs() as i64, 0).unwrap_or_default()
    };
    Ok(CertSummary {
        subject_o: name_attr(&tbs.subject, OID_O),
        subject_cn: name_attr(&tbs.subject, OID_CN),
        issuer_cn: name_attr(&tbs.issuer, OID_CN),
        serial: if serial.is_empty() { "0".into() } else { serial.into() },
        valid_from: to_utc(&tbs.validity.not_before),
        valid_to: to_utc(&tbs.validity.not_after),
        is_rsa: tbs.subject_public_key_info.algorithm.oid == crate::cades::OID_RSA_ENCRYPTION,
    })
}

pub fn name_attr(name: &Name, oid: ObjectIdentifier) -> Option<String> {
    name.0
        .iter()
        .flat_map(|rdn| rdn.0.iter())
        .find(|atv| atv.oid == oid)
        .and_then(|atv| any_to_string(&atv.value))
}

pub fn any_to_string(v: &Any) -> Option<String> {
    let bytes = v.value();
    match v.tag() {
        Tag::BmpString => {
            let units: Vec<u16> = bytes.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
            String::from_utf16(&units).ok()
        }
        Tag::Utf8String | Tag::PrintableString | Tag::Ia5String | Tag::TeletexString | Tag::VisibleString => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => None,
    }
}
