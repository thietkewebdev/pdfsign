use crate::error::{AppError, AppResult};
use axum::http::StatusCode;
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

pub fn sha256_hex(data: &str) -> String {
    hex::encode(Sha256::digest(data.as_bytes()))
}

pub fn generate_id(prefix: &str) -> String {
    let mut buf = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut buf);
    format!("{prefix}{}", hex::encode(buf))
}

pub fn generate_public_id() -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let mut buf = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn generate_session_token() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub fn generate_jti() -> String {
    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LaunchClaims {
    pub v: u8,
    pub typ: String,
    pub jti: String,
    pub job: String,
    pub api: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccessClaims {
    pub v: u8,
    pub typ: String,
    pub job: String,
    pub scope: String,
    pub exp: i64,
    pub iat: i64,
}

pub fn issue_launch_jwt(
    secret: &str,
    job_id: &str,
    api_base: &str,
    jti: &str,
    ttl_minutes: i64,
) -> AppResult<String> {
    let now = Utc::now();
    let claims = LaunchClaims {
        v: 1,
        typ: "launch".into(),
        jti: jti.into(),
        job: job_id.into(),
        api: api_base.trim_end_matches('/').into(),
        iat: now.timestamp(),
        exp: (now + Duration::minutes(ttl_minutes)).timestamp(),
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub fn decode_launch_jwt(secret: &str, token: &str) -> AppResult<LaunchClaims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["exp", "iat"]);
    let data = decode::<LaunchClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.to_lowercase().contains("expired") {
            AppError::coded(StatusCode::GONE, "LAUNCH_EXPIRED", "Liên kết ký đã hết hạn")
        } else {
            AppError::coded(
                StatusCode::UNAUTHORIZED,
                "INVALID_TOKEN",
                "Liên kết ký không hợp lệ",
            )
        }
    })?;
    if data.claims.typ != "launch" {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOKEN",
            "Not a launch token",
        ));
    }
    Ok(data.claims)
}

pub fn issue_access_jwt(secret: &str, job_id: &str, ttl_minutes: i64) -> AppResult<(String, i64)> {
    let now = Utc::now();
    let exp = (now + Duration::minutes(ttl_minutes)).timestamp();
    let claims = AccessClaims {
        v: 1,
        typ: "access".into(),
        job: job_id.into(),
        scope: "sign".into(),
        iat: now.timestamp(),
        exp,
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok((token, exp))
}

pub fn decode_access_jwt(secret: &str, token: &str) -> AppResult<AccessClaims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["exp", "iat"]);
    let data = decode::<AccessClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| {
        AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOKEN",
            "Phiên đăng nhập không hợp lệ",
        )
    })?;
    if data.claims.typ != "access" || data.claims.scope != "sign" {
        return Err(AppError::coded(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOKEN",
            "Not an access token",
        ));
    }
    Ok(data.claims)
}

pub fn deep_link(launch_jwt: &str) -> String {
    format!("pdfsign://v1/sign?t={launch_jwt}")
}

fn hmac_hex(secret: &str, parts: &[&str]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    for (i, p) in parts.iter().enumerate() {
        if i > 0 {
            mac.update(b"|");
        }
        mac.update(p.as_bytes());
    }
    hex::encode(mac.finalize().into_bytes())
}

fn ct_eq_hex(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

/// Short-lived HMAC-SHA256 for signer file download query (?k=&exp=).
pub fn file_download_sig(secret: &str, job_id: &str, exp: i64) -> String {
    hmac_hex(secret, &[job_id, &exp.to_string()])
}

pub fn verify_file_download_sig(secret: &str, job_id: &str, exp: i64, sig: &str) -> bool {
    if Utc::now().timestamp() > exp {
        return false;
    }
    ct_eq_hex(&file_download_sig(secret, job_id, exp), sig)
}

/// Short-lived HMAC-SHA256 for `/api/v1/storage/{key}?exp=&k=` downloads.
pub fn storage_download_sig(secret: &str, storage_key: &str, exp: i64) -> String {
    hmac_hex(secret, &["storage", storage_key, &exp.to_string()])
}

pub fn verify_storage_download_sig(secret: &str, storage_key: &str, exp: i64, sig: &str) -> bool {
    if Utc::now().timestamp() > exp {
        return false;
    }
    ct_eq_hex(&storage_download_sig(secret, storage_key, exp), sig)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_roundtrip_and_tamper() {
        let s = "test-secret-at-least-32-bytes-long!!";
        let k = file_download_sig(s, "job_abc", 9_999_999_999);
        assert!(verify_file_download_sig(s, "job_abc", 9_999_999_999, &k));
        assert!(!verify_file_download_sig(s, "job_abc", 9_999_999_999, "00"));
        assert!(!verify_file_download_sig(s, "job_other", 9_999_999_999, &k));
        let sk = storage_download_sig(s, "documents/x/v1.pdf", 9_999_999_999);
        assert!(verify_storage_download_sig(
            s,
            "documents/x/v1.pdf",
            9_999_999_999,
            &sk
        ));
    }
}
