#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pdfsign_core::{sign_pdf, verify_pdf, AppearanceOptions, PageSpec, RectPct, SignOptions, Timestamper};
use pdfsign_token::{discover, pin_from_string, CertSelector, Module, TokenError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiError {
    code: String,
    message: String,
}

impl From<TokenError> for UiError {
    fn from(e: TokenError) -> Self {
        UiError { code: e.code.as_str().into(), message: e.code.message_vi().into() }
    }
}

impl From<pdfsign_core::Error> for UiError {
    fn from(e: pdfsign_core::Error) -> Self {
        UiError { code: "GENERAL".into(), message: e.to_string() }
    }
}

impl From<std::io::Error> for UiError {
    fn from(e: std::io::Error) -> Self {
        UiError { code: "IO".into(), message: e.to_string() }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModuleInfo {
    path: PathBuf,
    vendor: Option<String>,
    slots: Vec<pdfsign_token::SlotSummary>,
    error: Option<String>,
}

#[tauri::command]
fn list_tokens(extra_module: Option<PathBuf>) -> Vec<ModuleInfo> {
    discover(extra_module.as_deref())
        .into_iter()
        .map(|c| match Module::load(&c.path).and_then(|m| m.token_slots()) {
            Ok(slots) => ModuleInfo {
                path: c.path,
                vendor: c.vendor,
                slots: slots.into_iter().map(|(_, s)| s).collect(),
                error: None,
            },
            Err(e) => ModuleInfo { path: c.path, vendor: c.vendor, slots: vec![], error: Some(e.code.as_str().into()) },
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CertInfo {
    index: usize,
    display_name: String,
    subject_cn: Option<String>,
    issuer_cn: Option<String>,
    serial: String,
    valid_to: String,
    valid_now: bool,
    is_ca: bool,
}

#[tauri::command]
fn list_certs(module: PathBuf, slot: usize) -> Result<Vec<CertInfo>, UiError> {
    let m = Module::load(&module)?;
    let now = chrono::Utc::now();
    Ok(m.list_certs(slot, None)?
        .into_iter()
        .map(|c| CertInfo {
            index: c.index,
            display_name: c.summary.display_name(),
            subject_cn: c.summary.subject_cn.clone(),
            issuer_cn: c.summary.issuer_cn.clone(),
            serial: c.summary.serial.clone(),
            valid_to: c.summary.valid_to.format("%d-%m-%Y").to_string(),
            valid_now: c.summary.is_time_valid(now),
            is_ca: c.summary.is_ca,
        })
        .collect())
}

/// Returns the PDF bytes as a binary IPC response (ArrayBuffer in JS) for pdf.js.
#[tauri::command]
fn read_pdf(path: PathBuf) -> Result<tauri::ipc::Response, UiError> {
    Ok(tauri::ipc::Response::new(std::fs::read(path)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignRequest {
    input: PathBuf,
    output: PathBuf,
    module: PathBuf,
    slot: usize,
    /// Serial from `list_certs`; stable across PKCS#11 sessions, unlike object order.
    cert_serial: String,
    /// 1-based page number.
    page: u32,
    rect: [f64; 4],
    pin: String,
    tsa: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignResult {
    output: PathBuf,
    field_name: String,
    level: String,
}

#[tauri::command]
async fn sign(req: SignRequest) -> Result<SignResult, UiError> {
    tauri::async_runtime::spawn_blocking(move || sign_blocking(req))
        .await
        .map_err(|e| UiError { code: "GENERAL".into(), message: e.to_string() })?
}

fn sign_blocking(req: SignRequest) -> Result<SignResult, UiError> {
    let pin = pin_from_string(req.pin);
    let input = std::fs::read(&req.input)?;
    let m = Module::load(&req.module)?;
    let mut signer = m.signer(req.slot, &pin, &CertSelector::Serial(req.cert_serial))?;
    drop(pin);
    let opts = SignOptions {
        page: PageSpec::Number(req.page),
        rect: RectPct { x: req.rect[0], y: req.rect[1], w: req.rect[2], h: req.rect[3] },
        appearance: AppearanceOptions::default(),
        ..Default::default()
    };
    let tsa = req.tsa.filter(|u| !u.trim().is_empty()).map(pdfsign_core::tsa::HttpTimestamper::new);
    let signed = sign_pdf(&input, &opts, &mut signer, tsa.as_ref().map(|t| t as &dyn Timestamper))?;
    let report = verify_pdf(&signed)?
        .into_iter()
        .find(|r| r.covers_whole_file && r.is_intact())
        .ok_or_else(|| UiError { code: "GENERAL".into(), message: "self-check failed".into() })?;
    std::fs::write(&req.output, &signed)?;
    Ok(SignResult {
        output: req.output,
        field_name: report.field_name,
        level: if report.has_timestamp { "PAdES-B-T" } else { "PAdES-B-B" }.into(),
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_tokens, list_certs, read_pdf, sign])
        .run(tauri::generate_context!())
        .expect("error while running PDFSign Signer");
}
