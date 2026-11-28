//! PKCS#11 access to Vietnamese CA USB tokens (Viettel, VNPT, BKAV, FPT, ...) via `cryptoki`.
//!
//! PIN values are only handled as [`cryptoki::types::AuthPin`] (a `secrecy::SecretString`):
//! they are zeroized on drop and never formatted by `Debug`. Do not log them.

pub mod discovery;
pub mod error;
pub mod syscerts;
pub mod token;

pub use cryptoki::types::AuthPin;
pub use discovery::{discover, ModuleCandidate};
pub use error::{ErrorCode, TokenError};
pub use syscerts::system_ca_certs;
pub use token::{CertSelector, Module, SignMechanism, SlotSummary, TokenCert, TokenSigner};

/// Wrap a PIN string; the input `String` is moved into zeroizing storage.
pub fn pin_from_string(pin: String) -> AuthPin {
    AuthPin::from(pin)
}
