//! Serializable verification result for the Verify tab / CLI JSON, with a Vietnamese verdict.

use crate::Result;
use pdfsign_core::soft::certs_from_pem_or_der;
use pdfsign_core::{verify_pdf_with, SignatureKindReport, SignatureReport, VerifyOptions};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevocationView {
    pub subject: String,
    pub source: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureView {
    pub field: String,
    pub kind: String,
    pub sub_filter: String,
    pub signer: Option<String>,
    pub signer_cn: Option<String>,
    pub issuer: Option<String>,
    pub serial: Option<String>,
    pub claimed_time: Option<String>,
    pub timestamp_time: Option<String>,
    pub level: String,
    pub integrity: bool,
    pub covers_whole_file: bool,
    pub timestamp_ok: Option<bool>,
    pub chain: Vec<String>,
    pub chain_complete: bool,
    pub cert_valid_at_signing: bool,
    pub trusted: Option<bool>,
    pub ltv: bool,
    pub revocation: Vec<RevocationView>,
    /// "valid", "warning" or "invalid".
    pub verdict: String,
    /// Vietnamese explanation lines.
    pub notes: Vec<String>,
    pub error: Option<String>,
}

fn view(r: &SignatureReport) -> SignatureView {
    let mut notes = Vec::new();
    let integrity = r.is_intact();
    if let Some(e) = &r.error {
        notes.push(format!("Không đọc được chữ ký: {e}"));
    }
    if !integrity {
        notes.push("Tài liệu đã bị thay đổi hoặc chữ ký không khớp.".into());
    }
    if integrity && !r.covers_whole_file {
        notes.push(
            "Có cập nhật sau khi ký (chữ ký khác, DSS hoặc dấu thời gian là bình thường).".into(),
        );
    }
    if r.timestamp_ok == Some(false) {
        notes.push("Dấu thời gian không hợp lệ.".into());
    }
    if !r.chain_complete {
        notes.push("Không dựng được chuỗi chứng thư đến CA gốc.".into());
    }
    if !r.cert_valid_at_signing {
        notes.push("Chứng thư không còn hiệu lực tại thời điểm ký.".into());
    }
    match r.trusted {
        Some(true) => notes.push("CA gốc nằm trong danh sách tin cậy.".into()),
        Some(false) => notes.push("CA gốc KHÔNG nằm trong danh sách tin cậy.".into()),
        None => notes.push("Chưa kiểm tra tin cậy (chưa khai báo CA gốc trong Cài đặt).".into()),
    }
    if r.revocation.iter().any(|x| x.status == "revoked") {
        notes.push("Có chứng thư bị THU HỒI.".into());
    }
    if r.ltv {
        notes.push("Đủ dữ liệu xác minh lâu dài (LTV) nhúng trong file.".into());
    } else if r.kind == SignatureKindReport::Signature {
        notes.push("Chưa đủ dữ liệu LTV (OCSP/CRL) trong file.".into());
    }
    let invalid = !integrity
        || r.error.is_some()
        || r.timestamp_ok == Some(false)
        || r.revocation.iter().any(|x| x.status == "revoked")
        || r.trusted == Some(false);
    let fully = integrity && r.chain_complete && r.cert_valid_at_signing && r.trusted == Some(true);
    SignatureView {
        field: r.field_name.clone(),
        kind: match r.kind {
            SignatureKindReport::Signature => "signature".into(),
            SignatureKindReport::DocTimeStamp => "docTimeStamp".into(),
        },
        sub_filter: r.sub_filter.clone(),
        signer: r.signer_name.clone(),
        signer_cn: r.signer_cn.clone(),
        issuer: r.issuer_cn.clone(),
        serial: r.serial.clone(),
        claimed_time: r.claimed_time.clone(),
        timestamp_time: r.timestamp_time.clone(),
        level: r.level.clone(),
        integrity,
        covers_whole_file: r.covers_whole_file,
        timestamp_ok: r.timestamp_ok,
        chain: r.chain.clone(),
        chain_complete: r.chain_complete,
        cert_valid_at_signing: r.cert_valid_at_signing,
        trusted: r.trusted,
        ltv: r.ltv,
        revocation: r
            .revocation
            .iter()
            .map(|x| RevocationView {
                subject: x.subject.clone(),
                source: x.source.clone(),
                status: x.status.clone(),
            })
            .collect(),
        verdict: if invalid {
            "invalid"
        } else if fully {
            "valid"
        } else {
            "warning"
        }
        .into(),
        notes,
        error: r.error.clone(),
    }
}

pub fn verify_file(
    path: &std::path::Path,
    trust_anchor_files: &[PathBuf],
) -> Result<Vec<SignatureView>> {
    let data = std::fs::read(path)?;
    let mut anchors = Vec::new();
    for f in trust_anchor_files {
        if let Ok(bytes) = std::fs::read(f) {
            anchors.extend(certs_from_pem_or_der(&bytes).unwrap_or_default());
        }
    }
    let reports = verify_pdf_with(
        &data,
        &VerifyOptions {
            trust_anchors: anchors,
        },
    )?;
    Ok(reports.iter().map(view).collect())
}
