use rand::RngCore;
use sha2::{Digest, Sha256};

pub fn sha256_hex(data: &str) -> String {
    hex::encode(Sha256::digest(data.as_bytes()))
}

pub fn generate_job_token() -> String {
    let mut buf = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub fn generate_claim_code() -> String {
    let mut buf = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub fn hash_claim_code(code: &str) -> String {
    sha256_hex(&code.to_lowercase().trim().to_string())
}

pub fn verify_claim_code(code: &str, stored_hash: &str) -> bool {
    let normalized = code.to_lowercase().trim().to_string();
    if !(6..=10).contains(&normalized.len()) || !normalized.chars().all(|c| c.is_ascii_hexdigit()) {
        return false;
    }
    hash_claim_code(&normalized) == stored_hash
}

pub fn hash_job_token(token: &str) -> String {
    sha256_hex(token)
}

pub fn verify_job_token(token: &str, stored_hash: &str) -> bool {
    hash_job_token(token) == stored_hash
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

pub fn base64url_encode_json(value: &serde_json::Value) -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let raw = serde_json::to_vec(value).expect("json");
    URL_SAFE_NO_PAD.encode(raw)
}

pub fn deep_link(job_id: &str, claim_code: &str, host: &str, template_id: Option<&str>) -> String {
    let mut payload = serde_json::json!({
        "j": job_id,
        "c": claim_code,
        "h": host,
    });
    if let Some(t) = template_id {
        payload["t"] = serde_json::Value::String(t.to_string());
    }
    format!("pdfsignpro://sign?p={}", base64url_encode_json(&payload))
}
