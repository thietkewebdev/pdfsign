use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen: String,
    pub public_url: String,
    pub public_host: String,
    pub storage_dir: PathBuf,
    pub job_expires_minutes: i64,
    pub max_signed_pdf_bytes: usize,
    pub cookie_secure: bool,
    pub cookie_name: String,
    /// Optional: "B-LT" or "B-LTA" to upgrade after client signs.
    pub server_upgrade_level: Option<String>,
    pub tsa_url: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();
        let public_url = env::var("APP_URL").unwrap_or_else(|_| "http://localhost:8080".into());
        let public_host = env::var("APP_PUBLIC_HOST").unwrap_or_else(|_| {
            url::Url::parse(&public_url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| "localhost".into())
        });
        let storage_dir = PathBuf::from(
            env::var("STORAGE_DIR").unwrap_or_else(|_| "./storage".into()),
        );
        Self {
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign".into()
            }),
            listen: env::var("LISTEN").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            public_url,
            public_host,
            storage_dir,
            job_expires_minutes: env::var("SIGNING_JOB_EXPIRES_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(90),
            max_signed_pdf_bytes: 25 * 1024 * 1024,
            cookie_secure: env::var("COOKIE_SECURE").ok().as_deref() == Some("1"),
            cookie_name: "pdfsign_session".into(),
            server_upgrade_level: env::var("SERVER_UPGRADE_LEVEL").ok().filter(|s| !s.is_empty()),
            tsa_url: env::var("TSA_URL").ok().filter(|s| !s.is_empty()),
        }
    }
}
