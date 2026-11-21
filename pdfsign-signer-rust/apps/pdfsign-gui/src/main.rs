#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pdfsign_app::jobs::{run_job, FileResult, SignJob};
use pdfsign_app::settings::{config_dir, Settings};
use pdfsign_app::templates::{ImageSlot, TemplateStore};
use pdfsign_app::verify_view::{verify_file, SignatureView};
use pdfsign_core::appearance::preview_pdf;
use pdfsign_core::ltv::UreqHttp;
use pdfsign_core::tsa::HttpTimestamper;
use pdfsign_core::{StampTemplate, StampValues, Timestamper};
use pdfsign_token::{discover, pin_from_string, CertSelector, Module, TokenError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiError {
    code: String,
    message: String,
}

const KNOWN_CODES: &[&str] = &[
    "PIN_INCORRECT",
    "PIN_LOCKED",
    "PIN_EXPIRED",
    "PIN_INVALID",
    "TOKEN_NOT_FOUND",
    "TOKEN_REMOVED",
    "NO_CERTS",
    "CERT_EXPIRED",
    "CERT_NOT_YET_VALID",
    "NO_PKCS11_DLL",
    "DEVICE_ERROR",
];

fn ui_err(e: impl std::fmt::Display) -> UiError {
    let message = e.to_string();
    let code = KNOWN_CODES.iter().find(|c| message.contains(*c)).copied().unwrap_or("GENERAL");
    UiError { code: code.into(), message }
}

impl From<TokenError> for UiError {
    fn from(e: TokenError) -> Self {
        UiError { code: e.code.as_str().into(), message: e.code.message_vi().into() }
    }
}

type UiResult<T> = Result<T, UiError>;

fn store() -> TemplateStore {
    TemplateStore::new(&config_dir())
}

#[tauri::command]
fn get_settings() -> Settings {
    Settings::load(&config_dir())
}

#[tauri::command]
fn save_settings(settings: Settings) -> UiResult<()> {
    settings.save(&config_dir()).map_err(ui_err)
}

#[tauri::command]
fn config_path() -> String {
    config_dir().display().to_string()
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
async fn list_tokens(extra_module: Option<PathBuf>) -> Vec<ModuleInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let extra = extra_module.or(Settings::load(&config_dir()).last_module);
        discover(extra.as_deref())
            .into_iter()
            .map(|c| match Module::load(&c.path).and_then(|m| m.token_slots()) {
                Ok(slots) => ModuleInfo {
                    path: c.path,
                    vendor: c.vendor,
                    slots: slots.into_iter().map(|(_, s)| s).collect(),
                    error: None,
                },
                Err(e) => ModuleInfo {
                    path: c.path,
                    vendor: c.vendor,
                    slots: vec![],
                    error: Some(e.code.as_str().into()),
                },
            })
            .collect()
    })
    .await
    .unwrap_or_default()
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
async fn list_certs(module: PathBuf, slot: usize) -> UiResult<Vec<CertInfo>> {
    tauri::async_runtime::spawn_blocking(move || -> UiResult<Vec<CertInfo>> {
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
    })
    .await
    .map_err(ui_err)?
}

/// PDF bytes as a binary IPC response (ArrayBuffer in JS) for pdf.js.
#[tauri::command]
fn read_pdf(path: PathBuf) -> UiResult<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(std::fs::read(path).map_err(ui_err)?))
}

#[tauri::command]
fn list_templates() -> Vec<StampTemplate> {
    store().list()
}

#[tauri::command]
fn save_template(template: StampTemplate) -> UiResult<StampTemplate> {
    store().save(template).map_err(ui_err)
}

#[tauri::command]
fn delete_template(id: String) -> UiResult<()> {
    store().delete(&id).map_err(ui_err)
}

#[tauri::command]
fn set_template_image(id: String, slot: String, path: Option<PathBuf>) -> UiResult<StampTemplate> {
    let slot = if slot == "seal" { ImageSlot::Seal } else { ImageSlot::Signature };
    store().set_image(&id, slot, path.as_deref()).map_err(ui_err)
}

/// Stamp preview as a one-page PDF at the box size (points), with sample values.
#[tauri::command]
fn template_preview(
    template: StampTemplate,
    width: f64,
    height: f64,
    signer: Option<String>,
) -> UiResult<tauri::ipc::Response> {
    let opts = store().appearance(&template).map_err(ui_err)?;
    let now = chrono::Utc::now().with_timezone(&pdfsign_core::sign::vn_offset());
    let values = StampValues {
        name: signer.clone().unwrap_or_else(|| "CÔNG TY TNHH MẪU".into()),
        cn: signer.unwrap_or_else(|| "Nguyễn Văn A".into()),
        org: "CÔNG TY TNHH MẪU".into(),
        issuer: "CA mẫu".into(),
        serial: "0123ABCD".into(),
        date: now.format(&template.date_format).to_string(),
        reason: "Phê duyệt".into(),
        location: "Hà Nội".into(),
    };
    let pdf = preview_pdf(width.max(20.0), height.max(10.0), &values, &opts).map_err(ui_err)?;
    Ok(tauri::ipc::Response::new(pdf))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignRequest {
    job: SignJob,
    template_id: String,
    module: PathBuf,
    slot: usize,
    cert_serial: String,
    pin: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    current: String,
}

#[tauri::command]
async fn sign_job(app: tauri::AppHandle, req: SignRequest) -> UiResult<Vec<FileResult>> {
    tauri::async_runtime::spawn_blocking(move || -> UiResult<Vec<FileResult>> {
        let pin = pin_from_string(req.pin);
        let tpl = store().get(&req.template_id).unwrap_or_default();
        let appearance = store().appearance(&tpl).map_err(ui_err)?;
        let m = Module::load(&req.module)?;
        let mut signer = m.signer(req.slot, &pin, &CertSelector::Serial(req.cert_serial.clone()))?;
        drop(pin);
        // Remember the token and certificate, never the PIN.
        let mut settings = Settings::load(&config_dir());
        settings.last_module = Some(req.module.clone());
        settings.last_slot = req.slot;
        settings.last_cert_serial = Some(req.cert_serial.clone());
        let _ = settings.save(&config_dir());

        let tsa = req.job.tsa_url.clone().filter(|u| !u.trim().is_empty()).map(HttpTimestamper::new);
        let http = UreqHttp::default();
        Ok(run_job(
            &req.job,
            &appearance,
            &mut signer,
            tsa.as_ref().map(|t| t as &dyn Timestamper),
            Some(&http),
            |done, total, current| {
                let _ = app.emit(
                    "sign-progress",
                    Progress { done, total, current: current.display().to_string() },
                );
            },
        ))
    })
    .await
    .map_err(ui_err)?
}

#[tauri::command]
async fn verify(path: PathBuf) -> UiResult<Vec<SignatureView>> {
    tauri::async_runtime::spawn_blocking(move || {
        let anchors = Settings::load(&config_dir()).trust_anchors;
        verify_file(&path, &anchors).map_err(ui_err)
    })
    .await
    .map_err(ui_err)?
}

#[tauri::command]
async fn test_tsa(url: String) -> UiResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = HttpTimestamper::new(url).timestamp(&[7u8; 32]).map_err(ui_err)?;
        Ok(format!("OK ({} byte)", token.len()))
    })
    .await
    .map_err(ui_err)?
}

#[tauri::command]
fn page_count(path: PathBuf) -> UiResult<usize> {
    let bytes = std::fs::read(path).map_err(ui_err)?;
    pdfsign_core::page_count(&bytes).map_err(ui_err)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            config_path,
            list_tokens,
            list_certs,
            read_pdf,
            list_templates,
            save_template,
            delete_template,
            set_template_image,
            template_preview,
            sign_job,
            verify,
            test_tsa,
            page_count
        ])
        .run(tauri::generate_context!())
        .expect("error while running PDFSign");
}
