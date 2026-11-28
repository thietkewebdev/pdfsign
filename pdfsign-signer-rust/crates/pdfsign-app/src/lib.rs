//! Application layer of the PDFSign desktop signer, shared by the Tauri GUI and the CLI.
//!
//! Offline mode builds a [`jobs::SignJob`] from the UI. Web mode uses [`remote::CloudJobSource`]
//! (`pdfsign://v1/sign?t=<launch_jwt>` → handshake → sign → idempotent complete).

pub mod jobs;
pub mod remote;
pub mod settings;
pub mod templates;
pub mod verify_view;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Core(#[from] pdfsign_core::Error),
    #[error("{}: {}", .0.code.as_str(), .0.code.message_vi())]
    Token(#[from] pdfsign_token::TokenError),
    #[error("lỗi đọc/ghi file: {0}")]
    Io(#[from] std::io::Error),
    /// Remote/protocol error with a stable machine code (e.g. `LAUNCH_USED`).
    #[error("{message}")]
    Remote { code: String, message: String },
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn remote(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Remote {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn code_str(&self) -> &str {
        match self {
            Self::Token(e) => e.code.as_str(),
            Self::Remote { code, .. } => code.as_str(),
            Self::Core(_) => "CORE",
            Self::Io(_) => "IO",
            Self::Other(_) => "GENERAL",
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
