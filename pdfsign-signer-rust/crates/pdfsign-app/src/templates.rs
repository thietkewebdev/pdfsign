//! Saved signature templates (`templates.json` + copied images under `template-images/`).

use crate::{AppError, Result};
use pdfsign_core::{AppearanceOptions, StampTemplate};
use std::path::{Path, PathBuf};

pub struct TemplateStore {
    dir: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageSlot {
    Seal,
    Signature,
}

impl TemplateStore {
    pub fn new(config_dir: &Path) -> Self {
        Self {
            dir: config_dir.to_path_buf(),
        }
    }

    fn file(&self) -> PathBuf {
        self.dir.join("templates.json")
    }

    fn images_dir(&self) -> PathBuf {
        self.dir.join("template-images")
    }

    /// User templates, or the built-in presets on first run.
    pub fn list(&self) -> Vec<StampTemplate> {
        std::fs::read(self.file())
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<StampTemplate>>(&b).ok())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(StampTemplate::presets)
    }

    pub fn get(&self, id: &str) -> Option<StampTemplate> {
        self.list().into_iter().find(|t| t.id == id)
    }

    fn write(&self, list: &[StampTemplate]) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let json = serde_json::to_vec_pretty(list).map_err(|e| AppError::Other(e.to_string()))?;
        std::fs::write(self.file(), json)?;
        Ok(())
    }

    /// Insert or replace by id (a new id is generated when empty).
    pub fn save(&self, mut tpl: StampTemplate) -> Result<StampTemplate> {
        if tpl.id.trim().is_empty() {
            tpl.id = format!("tpl-{}", chrono::Utc::now().timestamp_millis());
        }
        let mut list = self.list();
        match list.iter_mut().find(|t| t.id == tpl.id) {
            Some(existing) => *existing = tpl.clone(),
            None => list.push(tpl.clone()),
        }
        self.write(&list)?;
        Ok(tpl)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let list: Vec<_> = self.list().into_iter().filter(|t| t.id != id).collect();
        self.write(&list)
    }

    /// Copy an image (PNG/JPEG) into the store and attach it to the template.
    pub fn set_image(
        &self,
        id: &str,
        slot: ImageSlot,
        source: Option<&Path>,
    ) -> Result<StampTemplate> {
        let mut tpl = self
            .get(id)
            .ok_or_else(|| AppError::Other(format!("không có mẫu {id}")))?;
        let stored = match source {
            Some(src) => {
                let bytes = std::fs::read(src)?;
                image_kind(&bytes)
                    .ok_or_else(|| AppError::Other("ảnh phải là PNG hoặc JPEG".into()))?;
                std::fs::create_dir_all(self.images_dir())?;
                let ext = src
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("png")
                    .to_lowercase();
                let name = format!(
                    "{id}-{}.{ext}",
                    if slot == ImageSlot::Seal {
                        "seal"
                    } else {
                        "signature"
                    }
                );
                let dest = self.images_dir().join(name);
                std::fs::write(&dest, bytes)?;
                Some(dest.to_string_lossy().into_owned())
            }
            None => None,
        };
        match slot {
            ImageSlot::Seal => tpl.seal_image = stored,
            ImageSlot::Signature => tpl.signature_image = stored,
        }
        self.save(tpl)
    }

    /// Resolve a template into core appearance options (image files read into memory).
    pub fn appearance(&self, tpl: &StampTemplate) -> Result<AppearanceOptions> {
        let read = |p: &Option<String>| -> Result<Option<Vec<u8>>> {
            Ok(match p {
                Some(path) if !path.is_empty() => Some(std::fs::read(path)?),
                _ => None,
            })
        };
        Ok(AppearanceOptions {
            template: tpl.clone(),
            image: read(&tpl.seal_image)?,
            signature_image: read(&tpl.signature_image)?,
            ..Default::default()
        })
    }
}

fn image_kind(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        Some("jpeg")
    } else {
        None
    }
}
