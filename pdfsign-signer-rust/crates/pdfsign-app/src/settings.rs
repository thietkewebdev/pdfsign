//! Per-user settings (`%APPDATA%\PDFSign\settings.json` on Windows).
//! Never contains the PIN: there is deliberately no field for it.

use crate::{AppError, Result};
use pdfsign_core::PadesLevel;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TsaEntry {
    pub name: String,
    pub url: String,
    pub enabled: bool,
    /// Answered a real RFC 3161 request when the list was built.
    pub verified: bool,
}

/// Default TSA list. Verified = returned "Granted" to a SHA-256 query on 2026-11-14.
pub fn default_tsas() -> Vec<TsaEntry> {
    let e = |name: &str, url: &str, enabled: bool, verified: bool| TsaEntry {
        name: name.into(),
        url: url.into(),
        enabled,
        verified,
    };
    vec![
        e("DigiCert", "http://timestamp.digicert.com", true, true),
        e(
            "Ban Cơ yếu Chính phủ (ca.gov.vn)",
            "http://tsa.ca.gov.vn",
            true,
            true,
        ),
        e("Sectigo", "http://timestamp.sectigo.com", true, true),
        e(
            "GlobalSign",
            "http://timestamp.globalsign.com/tsa/r6advanced1",
            true,
            true,
        ),
        e(
            "Viettel-CA (chưa xác minh)",
            "http://tsa.viettel-ca.vn",
            false,
            false,
        ),
        e(
            "VNPT-CA (chưa xác minh)",
            "http://tsa.vnpt-ca.vn",
            false,
            false,
        ),
    ]
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Last PKCS#11 module used (remembered, never the PIN).
    pub last_module: Option<PathBuf>,
    pub last_slot: usize,
    pub last_cert_serial: Option<String>,
    pub tsas: Vec<TsaEntry>,
    /// URL of the preferred TSA.
    pub tsa_url: String,
    pub level: PadesLevel,
    pub template_id: String,
    pub output_suffix: String,
    pub output_dir: Option<PathBuf>,
    pub reason: String,
    pub location: String,
    /// Extra trusted root certificates (PEM/DER files) for the Verify tab.
    pub trust_anchors: Vec<PathBuf>,
    /// Default web API base when the launch JWT / deep link omits `api` / `&u=`.
    /// Override with env `PDFSIGN_WEB_API_BASE`.
    #[serde(default = "default_web_api_base")]
    pub web_api_base: String,
}

/// Production web default (configurable via settings / env).
pub const DEFAULT_WEB_API_BASE: &str = "https://pdfsign.thietkeweb.dev";

fn default_web_api_base() -> String {
    DEFAULT_WEB_API_BASE.into()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            last_module: None,
            last_slot: 0,
            last_cert_serial: None,
            tsas: default_tsas(),
            tsa_url: "http://timestamp.digicert.com".into(),
            level: PadesLevel::BT,
            template_id: "default".into(),
            output_suffix: "-da-ky".into(),
            output_dir: None,
            reason: String::new(),
            location: String::new(),
            trust_anchors: Vec::new(),
            web_api_base: DEFAULT_WEB_API_BASE.into(),
        }
    }
}

/// `PDFSIGN_CONFIG_DIR` overrides the location (tests, portable installs).
pub fn config_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("PDFSIGN_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("PDFSign")
}

impl Settings {
    pub fn path(dir: &Path) -> PathBuf {
        dir.join("settings.json")
    }

    pub fn load(dir: &Path) -> Settings {
        std::fs::read(Self::path(dir))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(|e| AppError::Other(e.to_string()))?;
        let tmp = dir.join("settings.json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(tmp, Self::path(dir))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_no_pin_field() {
        let dir = std::env::temp_dir().join(format!("pdfsign-settings-{}", std::process::id()));
        let s = Settings {
            last_module: Some("C:\\Windows\\System32\\viettel-ca_v6.dll".into()),
            last_cert_serial: Some("ABC".into()),
            ..Default::default()
        };
        s.save(&dir).unwrap();
        assert_eq!(Settings::load(&dir), s);
        let text = std::fs::read_to_string(Settings::path(&dir))
            .unwrap()
            .to_lowercase();
        assert!(!text.contains("pin\""));
        let _ = std::fs::remove_dir_all(dir);
    }
}
