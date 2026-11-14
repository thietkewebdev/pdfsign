//! Signing at a target PAdES baseline level.

use crate::cades::{RawSigner, Timestamper};
use crate::error::{Error, Result};
use crate::ltv::{add_document_timestamp, add_ltv_for_last_signature, Http};
use crate::sign::{sign_pdf, SignOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
pub enum PadesLevel {
    #[default]
    #[serde(rename = "B-B")]
    BB,
    #[serde(rename = "B-T")]
    BT,
    #[serde(rename = "B-LT")]
    BLT,
    #[serde(rename = "B-LTA")]
    BLTA,
}

impl PadesLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            PadesLevel::BB => "B-B",
            PadesLevel::BT => "B-T",
            PadesLevel::BLT => "B-LT",
            PadesLevel::BLTA => "B-LTA",
        }
    }
}

impl std::str::FromStr for PadesLevel {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, String> {
        match s.to_ascii_uppercase().replace('_', "-").as_str() {
            "B-B" | "BB" => Ok(PadesLevel::BB),
            "B-T" | "BT" => Ok(PadesLevel::BT),
            "B-LT" | "BLT" => Ok(PadesLevel::BLT),
            "B-LTA" | "BLTA" => Ok(PadesLevel::BLTA),
            _ => Err(format!("level must be B-B, B-T, B-LT or B-LTA, got {s}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LevelOutcome {
    pub pdf: Vec<u8>,
    /// Requested level, downgraded when validation data could not be completed.
    pub achieved: PadesLevel,
    pub warnings: Vec<String>,
}

/// Sign `input` at `level`. B-T and above need `tsa`; B-LT and above need `http` for AIA/OCSP/CRL.
pub fn sign_at_level(
    input: &[u8],
    opts: &SignOptions,
    signer: &mut dyn RawSigner,
    level: PadesLevel,
    tsa: Option<&dyn Timestamper>,
    http: Option<&dyn Http>,
) -> Result<LevelOutcome> {
    if level >= PadesLevel::BT && tsa.is_none() {
        return Err(Error::Tsa(format!("{} cần máy chủ cấp dấu thời gian (TSA)", level.as_str())));
    }
    let tsa_for_sig = if level >= PadesLevel::BT { tsa } else { None };
    let mut pdf = sign_pdf(input, opts, signer, tsa_for_sig)?;
    let mut achieved = if level >= PadesLevel::BT { PadesLevel::BT } else { PadesLevel::BB };
    let mut warnings = Vec::new();
    if level < PadesLevel::BLT {
        return Ok(LevelOutcome { pdf, achieved, warnings });
    }

    let http = http.ok_or_else(|| Error::Ltv("B-LT cần kết nối mạng để lấy OCSP/CRL".into()))?;
    let pool = signer.chain_der();
    let (with_dss, data) = add_ltv_for_last_signature(&pdf, &pool, http)?;
    pdf = with_dss;
    if !data.revoked.is_empty() {
        return Err(Error::Ltv(format!("chứng thư đã bị thu hồi: {}", data.revoked.join(", "))));
    }
    warnings.extend(data.warnings.iter().cloned());
    if data.warnings.is_empty() {
        achieved = PadesLevel::BLT;
    }
    if level == PadesLevel::BLTA {
        let tsa = tsa.expect("checked above");
        pdf = add_document_timestamp(&pdf, tsa)?;
        let (with_dss, dts_data) = add_ltv_for_last_signature(&pdf, &pool, http)?;
        pdf = with_dss;
        warnings.extend(dts_data.warnings.iter().cloned());
        if achieved == PadesLevel::BLT && dts_data.warnings.is_empty() {
            achieved = PadesLevel::BLTA;
        }
    }
    Ok(LevelOutcome { pdf, achieved, warnings })
}
