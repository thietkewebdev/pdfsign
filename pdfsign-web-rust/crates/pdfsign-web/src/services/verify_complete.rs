//! On job complete: verify uploaded PDF with pdfsign-core; optionally upgrade to B-LT/B-LTA.

use crate::error::{AppError, AppResult};
use axum::http::StatusCode;
use pdfsign_core::{verify_pdf, SignatureReport};
use serde_json::{json, Value};

pub struct VerifyOutcome {
    pub pdf: Vec<u8>,
    pub report: Vec<SignatureReport>,
    pub report_json: Value,
}

pub fn verify_signed_pdf(bytes: &[u8], cert_meta: Option<&Value>) -> AppResult<VerifyOutcome> {
    let reports = verify_pdf(bytes).map_err(|e| {
        AppError::coded(
            StatusCode::BAD_REQUEST,
            "INVALID_SIGNATURE",
            format!("Không đọc được chữ ký: {e}"),
        )
    })?;

    if reports.is_empty() {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "NO_SIGNATURE",
            "PDF không có chữ ký",
        ));
    }

    let last = reports
        .iter()
        .rev()
        .find(|r| r.kind == pdfsign_core::SignatureKindReport::Signature)
        .or_else(|| reports.last())
        .unwrap();

    if !last.digest_ok || !last.signature_ok {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "INTEGRITY_FAILED",
            "Chữ ký không hợp lệ (digest/signature)",
        ));
    }
    if !last.covers_whole_file {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "BYTE_RANGE_INCOMPLETE",
            "ByteRange không phủ toàn bộ file",
        ));
    }

    if let Some(meta) = cert_meta {
        if let Some(serial) = meta.get("serial").and_then(|v| v.as_str()) {
            if let Some(got) = last.serial.as_deref() {
                let a = serial.trim().trim_start_matches('0').to_lowercase();
                let b = got.trim().trim_start_matches('0').to_lowercase();
                if !a.is_empty() && a != b {
                    return Err(AppError::coded(
                        StatusCode::BAD_REQUEST,
                        "CERT_MISMATCH",
                        "Số serial chứng thư không khớp",
                    ));
                }
            }
        }
        if let Some(cn) = meta
            .get("subjectCN")
            .or_else(|| meta.get("subjectCn"))
            .and_then(|v| v.as_str())
        {
            if let Some(got) = last.signer_cn.as_deref() {
                if !cn.is_empty() && !got.eq_ignore_ascii_case(cn) {
                    return Err(AppError::coded(
                        StatusCode::BAD_REQUEST,
                        "CERT_MISMATCH",
                        "CN chứng thư không khớp",
                    ));
                }
            }
        }
    }

    let report_json = json!(reports
        .iter()
        .map(|r| json!({
            "field": r.field_name,
            "level": r.level,
            "digestOk": r.digest_ok,
            "signatureOk": r.signature_ok,
            "coversWholeFile": r.covers_whole_file,
            "signerCn": r.signer_cn,
            "serial": r.serial,
            "ltv": r.ltv,
        }))
        .collect::<Vec<_>>());

    Ok(VerifyOutcome {
        pdf: bytes.to_vec(),
        report: reports,
        report_json,
    })
}

/// Best-effort LTV upgrade. Failures are logged; original PDF is kept.
pub fn maybe_upgrade(pdf: Vec<u8>, level: Option<&str>, tsa_url: Option<&str>) -> Vec<u8> {
    let Some(level) = level else {
        return pdf;
    };
    let level = level.to_uppercase();
    if !matches!(level.as_str(), "B-LT" | "B-LTA" | "BLT" | "BLTA") {
        return pdf;
    }

    match upgrade_inner(&pdf, &level, tsa_url) {
        Ok(out) => out,
        Err(e) => {
            tracing::warn!("server upgrade {level} skipped: {e}");
            pdf
        }
    }
}

fn upgrade_inner(pdf: &[u8], level: &str, tsa_url: Option<&str>) -> anyhow::Result<Vec<u8>> {
    use pdfsign_core::ltv::{add_document_timestamp, add_ltv_for_last_signature, UreqHttp};
    use pdfsign_core::tsa::HttpTimestamper;
    use pdfsign_core::Timestamper;

    let http = UreqHttp::default();
    let (mut out, _) = add_ltv_for_last_signature(pdf, &[], &http)?;
    if matches!(level, "B-LTA" | "BLTA") {
        let url = tsa_url.unwrap_or("http://timestamp.digicert.com");
        let tsa = HttpTimestamper::new(url);
        out = add_document_timestamp(&out, &tsa as &dyn Timestamper)?;
        if let Ok((more, _)) = add_ltv_for_last_signature(&out, &[], &http) {
            out = more;
        }
    }
    Ok(out)
}
