use crate::error::{AppError, AppResult};
use axum::extract::Multipart;
use axum::Json;
use pdfsign_core::verify_pdf;
use serde_json::{json, Value};

pub async fn verify_upload(mut multipart: Multipart) -> AppResult<Json<Value>> {
    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad(e.to_string()))?
    {
        if field.name() == Some("file") {
            file_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::bad(e.to_string()))?
                    .to_vec(),
            );
        }
    }
    let bytes = file_bytes.ok_or_else(|| AppError::bad("Missing file"))?;
    let reports = verify_pdf(&bytes).map_err(|e| AppError::bad(format!("Không đọc được PDF: {e}")))?;
    let signatures: Vec<Value> = reports
        .iter()
        .map(|r| {
            json!({
                "field": r.field_name,
                "level": r.level,
                "digestOk": r.digest_ok,
                "signatureOk": r.signature_ok,
                "coversWholeFile": r.covers_whole_file,
                "signerCn": r.signer_cn,
                "serial": r.serial,
                "ltv": r.ltv,
            })
        })
        .collect();
    let ok = reports.iter().any(|r| r.digest_ok && r.signature_ok);
    Ok(Json(json!({
        "ok": ok,
        "signatures": signatures,
    })))
}
