//! PDF signing core for the PDFSign desktop signer (Rust rewrite).
//!
//! Produces PAdES baseline signatures (SubFilter `ETSI.CAdES.detached`, SHA-256, RSA PKCS#1 v1.5)
//! appended as a single incremental update, with an optional RFC 3161 timestamp (B-T).
//! The private-key operation is abstracted by [`RawSigner`], implemented by `pdfsign-token`
//! (PKCS#11) and by [`soft::SoftSigner`] (software key, tests only).

pub mod appearance;
pub mod cades;
pub mod certinfo;
pub mod error;
pub mod ltv;
pub mod pades;
pub mod pdfobj;
pub mod sign;
pub mod soft;
#[cfg(feature = "tsa")]
pub mod tsa;
pub mod verify;

pub use appearance::{AppearanceOptions, StampLayout, StampTemplate, StampValues, TextAlign};
pub use cades::{build_cades_detached, RawSigner, Timestamper};
pub use certinfo::{summarize, CertSummary};
pub use error::{Error, Result};
pub use pades::{sign_at_level, LevelOutcome, PadesLevel};
pub use sign::{append_update, prepare, sign_pdf, PageSpec, PreparedPdf, RectPct, SignOptions, SignatureKind};
pub use verify::{verify_pdf, verify_pdf_with, RevocationStatus, SignatureKindReport, SignatureReport, VerifyOptions};
