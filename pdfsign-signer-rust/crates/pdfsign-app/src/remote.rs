//! Web mode protocol v1: `pdfsign://v1/sign?t=<launch_jwt>`.
//! See `pdfsign-web-rust/docs/WEB-PLAN.md`. Private keys stay on the client token.

use crate::jobs::{sign_bytes, Placement, SignJob};
use crate::{AppError, Result};
use pdfsign_core::ltv::Http;
use pdfsign_core::{AppearanceOptions, CertSummary, PadesLevel, RawSigner, Timestamper};
use serde::Deserialize;
use serde_json::json;
use std::io::Read;
use std::time::Duration;

pub struct RemoteDocument {
    pub title: String,
    pub pdf: Vec<u8>,
    pub placement: Placement,
    pub template_id: Option<String>,
    pub seal_image: Option<Vec<u8>>,
    pub idempotency_key: String,
}

pub trait RemoteJobSource {
    fn fetch(&mut self) -> Result<RemoteDocument>;
    fn complete(&mut self, signed_pdf: &[u8], signer: &CertSummary) -> Result<String>;
}

#[derive(Debug, Clone)]
pub struct DeepLink {
    pub launch_token: String,
    pub api_hint: Option<String>,
}

impl DeepLink {
    /// `pdfsign://v1/sign?t=<jwt>` (optional `&u=` api base override).
    pub fn parse(url: &str) -> Result<Self> {
        let url = url.trim();
        if !url.to_lowercase().starts_with("pdfsign://") {
            return Err(AppError::Other(
                "deep link must start with pdfsign://".into(),
            ));
        }
        let normalized = url.replacen("pdfsign://", "https://pdfsign.local/", 1);
        let parsed = url::Url::parse(&normalized)
            .map_err(|e| AppError::Other(format!("bad deep link: {e}")))?;
        let path = parsed.path().trim_matches('/');
        if path != "v1/sign" && path != "sign" {
            return Err(AppError::Other(format!(
                "unsupported deep link path: {path}"
            )));
        }
        let mut launch_token = None;
        let mut api_hint = None;
        for (k, v) in parsed.query_pairs() {
            match k.as_ref() {
                "t" | "token" => launch_token = Some(v.to_string()),
                "u" | "api" => api_hint = Some(v.to_string()),
                _ => {}
            }
        }
        let launch_token = launch_token
            .ok_or_else(|| AppError::Other("deep link missing t= launch token".into()))?;
        Ok(Self {
            launch_token,
            api_hint,
        })
    }
}

pub struct CloudJobSource {
    agent: ureq::Agent,
    api_base: String,
    access_token: String,
    idempotency_key: String,
    job_id: String,
}

impl CloudJobSource {
    pub fn from_deep_link(deep_link: &str) -> Result<Self> {
        Self::from_deep_link_with_default(deep_link, None)
    }

    /// Resolve API base: deep-link `&u=` → JWT `api` claim → `default_api` →
    /// env `PDFSIGN_WEB_API_BASE` → [`crate::settings::DEFAULT_WEB_API_BASE`].
    pub fn from_deep_link_with_default(deep_link: &str, default_api: Option<&str>) -> Result<Self> {
        let link = DeepLink::parse(deep_link)?;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(60)))
            .build()
            .into();

        // Resolve API base:
        // 1) Signed JWT `api` claim (authoritative for the job's home server)
        // 2) Unsigned deep-link `&u=` only when same host as configured settings
        // 3) Configured / env / default
        // Download URLs are still same-host checked against the resolved base.
        let configured = default_api
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| std::env::var("PDFSIGN_WEB_API_BASE").ok())
            .unwrap_or_else(|| crate::settings::DEFAULT_WEB_API_BASE.to_string());
        let configured = configured.trim_end_matches('/').to_string();
        let jwt_api = peek_launch_api(&link.launch_token);
        let api_base = jwt_api
            .or_else(|| {
                link.api_hint
                    .clone()
                    .filter(|h| same_api_host(&configured, h))
            })
            .map(|s| s.trim_end_matches('/').to_string())
            .unwrap_or(configured);

        let health_url = format!("{api_base}/api/v1/health");
        let mut health_resp = agent
            .get(&health_url)
            .call()
            .map_err(|e| AppError::Other(format!("health failed: {e}")))?;
        let health: Health = read_json(&mut health_resp)?;
        if !health.ok || health.protocol.unwrap_or(0) < 1 {
            return Err(AppError::Other(format!(
                "server protocol unsupported: {:?}",
                health.protocol
            )));
        }

        let hs_url = format!("{api_base}/api/v1/signer/handshake");
        let hs_body = json!({ "launchToken": link.launch_token }).to_string();
        let mut hs_resp = agent
            .post(&hs_url)
            .header("Content-Type", "application/json")
            .send(hs_body)
            .map_err(|e| AppError::Other(format!("handshake failed: {e}")))?;
        let hs: Handshake = read_json(&mut hs_resp)?;
        let resolved = hs
            .api_base
            .filter(|u| same_api_host(&api_base, u))
            .unwrap_or(api_base);

        Ok(Self {
            agent,
            api_base: resolved,
            access_token: hs.access_token,
            idempotency_key: String::new(),
            job_id: hs.job_id,
        })
    }

    fn auth(&self) -> String {
        format!("Bearer {}", self.access_token)
    }
}

impl RemoteJobSource for CloudJobSource {
    fn fetch(&mut self) -> Result<RemoteDocument> {
        let url = format!("{}/api/v1/signer/job", self.api_base);
        let mut resp = self
            .agent
            .get(&url)
            .header("Authorization", &self.auth())
            .call()
            .map_err(|e| AppError::Other(format!("get job failed: {e}")))?;
        let job: JobPayload = read_json(&mut resp)?;
        self.idempotency_key = job.idempotency_key.clone();
        self.job_id = job.job_id.clone();

        if !same_api_host(&self.api_base, &job.download_url) {
            return Err(AppError::remote(
                "INVALID_DOWNLOAD",
                "downloadUrl không thuộc máy chủ API đã cấu hình",
            ));
        }
        let mut pdf_resp = self
            .agent
            .get(&job.download_url)
            .call()
            .map_err(|e| AppError::Other(format!("download PDF failed: {e}")))?;
        let mut pdf = Vec::new();
        pdf_resp
            .body_mut()
            .as_reader()
            .take(25 * 1024 * 1024 + 1)
            .read_to_end(&mut pdf)
            .map_err(|e| AppError::Other(format!("read PDF: {e}")))?;
        if pdf.len() > 25 * 1024 * 1024 {
            return Err(AppError::remote("FILE_TOO_LARGE", "PDF vượt quá 25MB"));
        }

        let seal_image = match job.seal_image_url.as_ref() {
            Some(u) => {
                let mut r = self
                    .agent
                    .get(u)
                    .call()
                    .map_err(|e| AppError::Other(format!("seal download: {e}")))?;
                let mut buf = Vec::new();
                r.body_mut()
                    .as_reader()
                    .read_to_end(&mut buf)
                    .map_err(|e| AppError::Other(format!("seal read: {e}")))?;
                Some(buf)
            }
            None => None,
        };

        let page = match &job.placement.page {
            PageValue::Last(_) => 0,
            PageValue::Num(n) => *n,
        };
        let r = &job.placement.rect_pct;
        Ok(RemoteDocument {
            title: job.document.title.unwrap_or_default(),
            pdf,
            placement: Placement {
                page,
                x: r.x,
                y: r.y,
                w: r.w,
                h: r.h,
            },
            template_id: job.template_id,
            seal_image,
            idempotency_key: job.idempotency_key,
        })
    }

    fn complete(&mut self, signed_pdf: &[u8], signer: &CertSummary) -> Result<String> {
        let url = format!("{}/api/v1/signer/complete", self.api_base);
        let cert_meta = json!({
            "subjectCN": signer.subject_cn,
            "subjectO": signer.subject_o,
            "issuerCN": signer.issuer_cn,
            "serial": signer.serial,
            "signingTime": chrono::Utc::now().to_rfc3339(),
        });
        let boundary = format!("----pdfsign{}", chrono::Utc::now().timestamp_millis());
        let mut body = Vec::new();
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"certMeta\"\r\n\r\n{cert_meta}\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"signed.pdf\"\r\nContent-Type: application/pdf\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(signed_pdf);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

        let mut last_err = None;
        for attempt in 0..3u32 {
            match self
                .agent
                .post(&url)
                .header("Authorization", &self.auth())
                .header("Idempotency-Key", &self.idempotency_key)
                .header(
                    "Content-Type",
                    &format!("multipart/form-data; boundary={boundary}"),
                )
                .send(&body)
            {
                Ok(mut resp) => {
                    let done: CompletePayload = read_json(&mut resp)?;
                    return Ok(done
                        .signed_download_url
                        .or(done.signed_public_url)
                        .unwrap_or_else(|| self.job_id.clone()));
                }
                Err(e) => {
                    let msg = e.to_string();
                    // Do not retry client errors (LAUNCH_USED, INTEGRITY_FAILED, …).
                    if msg.contains("4")
                        && (msg.contains("400")
                            || msg.contains("401")
                            || msg.contains("403")
                            || msg.contains("404")
                            || msg.contains("409")
                            || msg.contains("410")
                            || msg.contains("422"))
                    {
                        return Err(AppError::Other(format!("complete failed: {msg}")));
                    }
                    last_err = Some(msg);
                    std::thread::sleep(Duration::from_millis(300 * (attempt + 1) as u64));
                }
            }
        }
        Err(AppError::Other(format!(
            "complete failed after retries: {}",
            last_err.unwrap_or_default()
        )))
    }
}

/// End-to-end: deep link → fetch → sign → complete.
pub fn run_remote_job(
    deep_link: &str,
    appearance: &AppearanceOptions,
    signer: &mut dyn RawSigner,
    level: PadesLevel,
    tsa: Option<&dyn Timestamper>,
    http: Option<&dyn Http>,
) -> Result<String> {
    run_remote_job_with_api(deep_link, None, appearance, signer, level, tsa, http)
}

pub fn run_remote_job_with_api(
    deep_link: &str,
    default_api: Option<&str>,
    appearance: &AppearanceOptions,
    signer: &mut dyn RawSigner,
    level: PadesLevel,
    tsa: Option<&dyn Timestamper>,
    http: Option<&dyn Http>,
) -> Result<String> {
    let mut src = CloudJobSource::from_deep_link_with_default(deep_link, default_api)?;
    let doc = src.fetch()?;
    let mut appearance = appearance.clone();
    if let Some(seal) = doc.seal_image {
        appearance.image = Some(seal);
    }
    let job = SignJob {
        inputs: vec![],
        output: crate::jobs::OutputSpec::File {
            path: "remote.pdf".into(),
        },
        placements: vec![doc.placement],
        level,
        tsa_url: None,
        reason: None,
        location: None,
        overwrite: true,
    };
    let (signed, _lvl, _warn) = sign_bytes(&doc.pdf, &job, &appearance, signer, tsa, http)?;
    let cert = cert_from_signed(&signed).unwrap_or_else(|| CertSummary {
        subject_o: None,
        subject_cn: None,
        issuer_cn: None,
        serial: String::new(),
        valid_from: chrono::Utc::now(),
        valid_to: chrono::Utc::now(),
        is_rsa: true,
        is_ca: false,
        rsa_modulus: None,
    });
    src.complete(&signed, &cert)
}

fn cert_from_signed(pdf: &[u8]) -> Option<CertSummary> {
    let reports = pdfsign_core::verify_pdf(pdf).ok()?;
    let r = reports.into_iter().rev().find(|r| {
        r.kind == pdfsign_core::SignatureKindReport::Signature && r.digest_ok && r.signature_ok
    })?;
    Some(CertSummary {
        subject_o: r.signer_name,
        subject_cn: r.signer_cn,
        issuer_cn: r.issuer_cn,
        serial: r.serial.unwrap_or_default(),
        valid_from: chrono::Utc::now(),
        valid_to: chrono::Utc::now(),
        is_rsa: true,
        is_ca: false,
        rsa_modulus: None,
    })
}

fn peek_launch_api(jwt: &str) -> Option<String> {
    let payload = jwt.split('.').nth(1)?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("api")?.as_str().map(|s| s.to_string())
}

fn same_api_host(configured: &str, candidate: &str) -> bool {
    let parse = |s: &str| {
        let s = s.trim();
        let with_scheme = if s.contains("://") {
            s.to_string()
        } else {
            format!("https://{s}")
        };
        url::Url::parse(&with_scheme).ok()
    };
    match (parse(configured), parse(candidate)) {
        (Some(a), Some(b)) => {
            a.host_str().map(|h| h.to_ascii_lowercase())
                == b.host_str().map(|h| h.to_ascii_lowercase())
        }
        _ => false,
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(
    resp: &mut ureq::http::Response<ureq::Body>,
) -> Result<T> {
    let status = resp.status().as_u16();
    let mut buf = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut buf)
        .map_err(|e| AppError::Other(e.to_string()))?;
    if !(200..300).contains(&status) {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ErrBody {
            error: Option<String>,
            error_code: Option<String>,
            #[serde(alias = "code")]
            code: Option<String>,
            message: Option<String>,
        }
        let parsed: Option<ErrBody> = serde_json::from_slice(&buf).ok();
        let code = parsed
            .as_ref()
            .and_then(|e| e.error_code.clone().or(e.code.clone()))
            .unwrap_or_else(|| format!("HTTP_{status}"));
        let message = parsed
            .as_ref()
            .and_then(|e| e.error.clone().or(e.message.clone()))
            .unwrap_or_else(|| String::from_utf8_lossy(&buf).chars().take(200).collect());
        return Err(AppError::remote(code, message));
    }
    serde_json::from_slice(&buf).map_err(|e| AppError::Other(format!("json: {e}")))
}

#[derive(Deserialize)]
struct Health {
    ok: bool,
    protocol: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Handshake {
    access_token: String,
    job_id: String,
    api_base: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobPayload {
    job_id: String,
    document: DocMeta,
    placement: PlacementDto,
    download_url: String,
    seal_image_url: Option<String>,
    template_id: Option<String>,
    idempotency_key: String,
}

#[derive(Deserialize)]
struct DocMeta {
    title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlacementDto {
    page: PageValue,
    rect_pct: RectDto,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PageValue {
    Num(u32),
    /// Server sends `"last"` (or similar); we only need the variant, not the text.
    Last(#[allow(dead_code)] String),
}

#[derive(Deserialize)]
struct RectDto {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletePayload {
    signed_download_url: Option<String>,
    signed_public_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_v1_sign_deep_link() {
        let d = DeepLink::parse("pdfsign://v1/sign?t=abc.def.ghi").unwrap();
        assert_eq!(d.launch_token, "abc.def.ghi");
        assert!(d.api_hint.is_none());
    }

    #[test]
    fn parse_with_api_hint() {
        let d =
            DeepLink::parse("pdfsign://v1/sign?t=tok&u=https%3A%2F%2Fpdfsign.example%2F").unwrap();
        assert_eq!(d.launch_token, "tok");
        assert_eq!(d.api_hint.as_deref(), Some("https://pdfsign.example/"));
    }

    #[test]
    fn reject_bad_scheme() {
        assert!(DeepLink::parse("https://evil/v1/sign?t=x").is_err());
    }

    #[test]
    fn default_api_fallback_constant() {
        assert_eq!(
            crate::settings::DEFAULT_WEB_API_BASE,
            "https://pdfsign.thietkeweb.dev"
        );
    }

    #[test]
    fn same_host_accepts_path_diff() {
        assert!(same_api_host(
            "https://pdfsign.example",
            "https://pdfsign.example/api/v1/files/x"
        ));
        assert!(same_api_host(
            "https://PDFSign.Example/",
            "https://pdfsign.example"
        ));
    }

    #[test]
    fn same_host_rejects_other_host() {
        assert!(!same_api_host(
            "https://pdfsign.example",
            "https://evil.example/steal"
        ));
        assert!(!same_api_host("https://pdfsign.example", "not-a-url"));
    }
}
