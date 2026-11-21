use crate::config::Config;
use crate::error::{AppError, AppResult};
use axum::http::StatusCode;
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Clone)]
pub struct LocalStorage {
    root: PathBuf,
    public_url: String,
}

impl LocalStorage {
    pub fn new(cfg: &Config) -> Self {
        Self {
            root: cfg.storage_dir.clone(),
            public_url: cfg.public_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn ensure_root(&self) -> AppResult<()> {
        fs::create_dir_all(&self.root)
            .await
            .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(())
    }

    fn abs(&self, key: &str) -> PathBuf {
        self.root.join(key)
    }

    pub fn abs_path(&self, key: &str) -> PathBuf {
        self.abs(key)
    }

    pub async fn upload(&self, key: &str, bytes: &[u8]) -> AppResult<()> {
        let path = self.abs(key);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        fs::write(&path, bytes)
            .await
            .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(())
    }

    pub async fn read(&self, key: &str) -> AppResult<Vec<u8>> {
        fs::read(self.abs(key))
            .await
            .map_err(|_| AppError::not_found("File not found"))
    }

    pub fn exists_sync(&self, key: &str) -> bool {
        Path::new(&self.abs(key)).exists()
    }

    /// Local driver URL under /api/v1/storage/.
    pub fn public_file_url(&self, key: &str) -> String {
        format!("{}/api/v1/storage/{}", self.public_url, key)
    }
}
