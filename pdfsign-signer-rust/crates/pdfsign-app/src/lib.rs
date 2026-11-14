//! Application layer of the PDFSign desktop signer, shared by the Tauri GUI and the CLI.
//!
//! Offline mode builds a [`jobs::SignJob`] from the UI. The later web mode (`pdfsignpro://`
//! deep link + local bridge on 127.0.0.1:17886, see docs/ANALYSIS.md) plugs in through
//! [`remote::RemoteJobSource`]: it turns a claimed cloud job into the same `SignJob`, and uploads
//! the result. Nothing in this crate talks to the network except TSA/OCSP/CRL/AIA fetching.

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
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, AppError>;
