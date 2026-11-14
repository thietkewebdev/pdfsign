//! Software RSA signer (PKCS#8 PEM key + PEM/DER certificate). For tests and CI only:
//! production keys stay on the hardware token.

use crate::cades::RawSigner;
use crate::error::{Error, Result};
use rsa::pkcs1v15::Pkcs1v15Sign;
use rsa::pkcs8::DecodePrivateKey;
use rsa::RsaPrivateKey;

pub struct SoftSigner {
    key: RsaPrivateKey,
    cert_der: Vec<u8>,
    chain: Vec<Vec<u8>>,
}

impl SoftSigner {
    pub fn from_pem(key_pem: &str, cert_pem_or_der: &[u8], chain: Vec<Vec<u8>>) -> Result<Self> {
        let key = RsaPrivateKey::from_pkcs8_pem(key_pem).map_err(|e| Error::Signer(format!("private key: {e}")))?;
        Ok(Self { key, cert_der: cert_to_der(cert_pem_or_der)?, chain })
    }
}

/// Accept a PEM ("-----BEGIN CERTIFICATE-----") or raw DER certificate.
pub fn cert_to_der(data: &[u8]) -> Result<Vec<u8>> {
    Ok(certs_from_pem_or_der(data)?.into_iter().next().ok_or_else(|| Error::Certificate("no certificate".into()))?)
}

pub fn certs_from_pem_or_der(data: &[u8]) -> Result<Vec<Vec<u8>>> {
    let text = String::from_utf8_lossy(data);
    if !text.contains("-----BEGIN CERTIFICATE-----") {
        return Ok(vec![data.to_vec()]);
    }
    let mut out = Vec::new();
    for block in text.split("-----BEGIN CERTIFICATE-----").skip(1) {
        let body = block.split("-----END CERTIFICATE-----").next().unwrap_or("");
        let b64: String = body.chars().filter(|c| !c.is_whitespace()).collect();
        out.push(base64_decode(&b64).ok_or_else(|| Error::Certificate("invalid PEM base64".into()))?);
    }
    Ok(out)
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    }
    let bytes: Vec<u8> = s.bytes().filter(|c| *c != b'=').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let mut acc = 0u32;
        for (i, c) in chunk.iter().enumerate() {
            acc |= val(*c)? << (18 - 6 * i);
        }
        out.push((acc >> 16) as u8);
        if chunk.len() > 2 {
            out.push((acc >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(acc as u8);
        }
    }
    Some(out)
}

impl RawSigner for SoftSigner {
    fn certificate_der(&self) -> Vec<u8> {
        self.cert_der.clone()
    }

    fn chain_der(&self) -> Vec<Vec<u8>> {
        self.chain.clone()
    }

    fn sign_sha256_digest(&mut self, digest: &[u8; 32]) -> std::result::Result<Vec<u8>, String> {
        self.key.sign(Pkcs1v15Sign::new::<sha2::Sha256>(), digest).map_err(|e| e.to_string())
    }
}
