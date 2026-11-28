//! Simple in-process token-bucket rate limiter (per client IP).
//! Good enough for single-node sv14; replace with Redis if multi-node later.

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tower::{Layer, Service};

#[derive(Clone)]
pub struct RateLimitLayer {
    inner: Arc<Mutex<Store>>,
    max: u32,
    window: Duration,
}

struct Store {
    hits: HashMap<String, (u32, Instant)>,
}

impl RateLimitLayer {
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Store {
                hits: HashMap::new(),
            })),
            max,
            window,
        }
    }
}

impl<S> Layer<S> for RateLimitLayer {
    type Service = RateLimitService<S>;
    fn layer(&self, service: S) -> Self::Service {
        RateLimitService {
            inner: service,
            store: self.inner.clone(),
            max: self.max,
            window: self.window,
        }
    }
}

#[derive(Clone)]
pub struct RateLimitService<S> {
    inner: S,
    store: Arc<Mutex<Store>>,
    max: u32,
    window: Duration,
}

impl<S> Service<Request<Body>> for RateLimitService<S>
where
    S: Service<Request<Body>, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let key = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip().to_string())
            .or_else(|| {
                req.headers()
                    .get("x-forwarded-for")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.split(',').next())
                    .map(|s| s.trim().to_string())
            })
            .unwrap_or_else(|| "unknown".into());

        let path = req.uri().path().to_string();
        let limited = path.starts_with("/api/v1/auth/")
            || path == "/api/v1/documents"
            || path == "/api/v1/jobs"
            || path == "/api/v1/signer/handshake"
            || path == "/api/v1/verify"
            || path.starts_with("/api/v1/uploads");

        if limited {
            let mut g = self.store.lock().unwrap_or_else(|e| e.into_inner());
            let now = Instant::now();
            g.hits
                .retain(|_, (_, t)| now.duration_since(*t) < self.window);
            let entry = g.hits.entry(key).or_insert((0, now));
            if now.duration_since(entry.1) >= self.window {
                *entry = (0, now);
            }
            entry.0 += 1;
            if entry.0 > self.max {
                return Box::pin(async {
                    Ok((
                        StatusCode::TOO_MANY_REQUESTS,
                        axum::Json(serde_json::json!({
                            "error": "Quá nhiều yêu cầu, thử lại sau",
                            "errorCode": "RATE_LIMITED",
                        })),
                    )
                        .into_response())
                });
            }
        }

        let mut inner = self.inner.clone();
        Box::pin(async move { inner.call(req).await })
    }
}
