use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen: String,
    pub public_url: String,
    pub storage_dir: PathBuf,
    /// Static downloads (Windows installer, etc.) — independent of STORAGE_DIR.
    pub downloads_dir: PathBuf,
    pub web_dist: PathBuf,
    pub job_expires_minutes: i64,
    pub launch_ttl_minutes: i64,
    pub max_signed_pdf_bytes: usize,
    pub cookie_secure: bool,
    pub cookie_name: String,
    pub jwt_secret: String,
    pub server_upgrade_level: Option<String>,
    pub tsa_url: Option<String>,
    /// Auto-delete uploaded/signed file blobs after this many hours (default 48).
    pub file_retention_hours: i64,
    /// One-time free signatures for newly registered accounts on plan=free.
    pub registered_trial_files: i32,
    /// Optional bearer token for admin plan endpoints (in addition to role=ADMIN).
    pub admin_token: Option<String>,
    /// Comma-separated CORS origins. Empty → derive from public_url + localhost.
    pub cors_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();
        let public_url = env::var("PUBLIC_BASE_URL")
            .or_else(|_| env::var("APP_URL"))
            .unwrap_or_else(|_| "http://127.0.0.1:8080".into());
        let storage_dir =
            PathBuf::from(env::var("STORAGE_DIR").unwrap_or_else(|_| "./storage".into()));
        let downloads_dir =
            PathBuf::from(env::var("DOWNLOADS_DIR").unwrap_or_else(|_| "./downloads".into()));
        let web_dist = PathBuf::from(env::var("WEB_DIST").unwrap_or_else(|_| "web/dist".into()));

        let allow_insecure = env::var("PDFSIGN_ALLOW_INSECURE_DEV").ok().as_deref() == Some("1");
        let jwt_secret = match env::var("JWT_SECRET").or_else(|_| env::var("HMAC_SECRET")) {
            Ok(s) if s.len() >= 32 => s,
            Ok(s) if allow_insecure => {
                tracing::warn!("JWT_SECRET shorter than 32 bytes (insecure dev mode)");
                s
            }
            Ok(_) => panic!(
                "JWT_SECRET must be at least 32 characters (set PDFSIGN_ALLOW_INSECURE_DEV=1 only for local dev)"
            ),
            Err(_) if allow_insecure => {
                tracing::warn!("Using insecure default JWT_SECRET (dev only)");
                "dev-pdfsign-jwt-secret-change-me".into()
            }
            Err(_) => panic!(
                "JWT_SECRET is required (or set PDFSIGN_ALLOW_INSECURE_DEV=1 for local development)"
            ),
        };

        let cors_origins = env::var("CORS_ORIGINS")
            .ok()
            .map(|s| {
                s.split(',')
                    .map(|x| x.trim().trim_end_matches('/').to_string())
                    .filter(|x| !x.is_empty())
                    .collect::<Vec<_>>()
            })
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                let mut v = vec![
                    public_url.trim_end_matches('/').to_string(),
                    "http://127.0.0.1:8080".into(),
                    "http://localhost:8080".into(),
                    "http://127.0.0.1:5173".into(),
                    "http://localhost:5173".into(),
                ];
                v.sort();
                v.dedup();
                v
            });

        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign".into()),
            listen: env::var("LISTEN").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            public_url,
            storage_dir,
            downloads_dir,
            web_dist,
            job_expires_minutes: env::var("SIGNING_JOB_EXPIRES_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(90),
            launch_ttl_minutes: env::var("LAUNCH_TTL_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(15),
            max_signed_pdf_bytes: 25 * 1024 * 1024,
            cookie_secure: env::var("COOKIE_SECURE").ok().as_deref() == Some("1"),
            cookie_name: "pdfsign_session".into(),
            jwt_secret,
            server_upgrade_level: env::var("SERVER_UPGRADE_LEVEL")
                .ok()
                .filter(|s| !s.is_empty()),
            tsa_url: env::var("TSA_URL").ok().filter(|s| !s.is_empty()),
            file_retention_hours: env::var("FILE_RETENTION_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(48),
            registered_trial_files: env::var("REGISTERED_TRIAL_FILES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(5),
            admin_token: env::var("ADMIN_TOKEN").ok().filter(|s| !s.is_empty()),
            cors_origins,
        }
    }

    pub fn api_base(&self) -> String {
        self.public_url.trim_end_matches('/').to_string()
    }
}
