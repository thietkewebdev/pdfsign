//! Seam for the future web mode. Not implemented in phase 1.
//!
//! A web-mode implementation would:
//! 1. parse `pdfsignpro://sign?p=<base64url {j, c, h, t}>` and `POST /api/jobs/{j}/claim {code}`;
//! 2. `GET /api/jobs/{j}` (header `x-job-token`) and download `inputPdfUrl` / `sealImageUrl`;
//! 3. map `placement {page, rectPct}` to a [`crate::jobs::Placement`] (page "LAST" -> 0);
//! 4. sign with [`crate::jobs::sign_bytes`] using the user's token;
//! 5. `POST /api/jobs/{j}/complete` (multipart `file` + `certMeta`).
//!
//! The local bridge (`GET /health`, `POST /certs`) would reuse `pdfsign_token` directly.

use crate::jobs::Placement;
use crate::Result;
use pdfsign_core::CertSummary;

/// What a remote job provides to the signing pipeline.
pub struct RemoteDocument {
    pub title: String,
    pub pdf: Vec<u8>,
    pub placement: Placement,
    pub template_id: Option<String>,
    pub seal_image: Option<Vec<u8>>,
}

/// Implemented by web mode (cloud job API). The offline app never calls this.
pub trait RemoteJobSource {
    fn fetch(&mut self) -> Result<RemoteDocument>;
    fn complete(&mut self, signed_pdf: &[u8], signer: &CertSummary) -> Result<String>;
}
