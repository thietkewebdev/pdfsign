use thiserror::Error;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("PDF parse error: {0}")]
    Pdf(#[from] lopdf::Error),
    #[error("unsupported PDF: {0}")]
    Unsupported(String),
    #[error("invalid placement: {0}")]
    Placement(String),
    #[error("font error: {0}")]
    Font(String),
    #[error("image error: {0}")]
    Image(String),
    #[error("certificate error: {0}")]
    Certificate(String),
    #[error("ASN.1/DER error: {0}")]
    Der(#[from] der::Error),
    #[error("signature too large for reserved /Contents ({needed} > {reserved} bytes)")]
    ContentsTooSmall { needed: usize, reserved: usize },
    #[error("signer error: {0}")]
    Signer(String),
    #[error("timestamp (TSA) error: {0}")]
    Tsa(String),
    #[error("LTV error: {0}")]
    Ltv(String),
    #[error("verification failed: {0}")]
    Verify(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}
