use pdfsign_web::{app, build_state, retention};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let state = build_state().await?;
    retention::spawn_cleanup_loop(state.clone());

    let listen = state.cfg.listen.clone();
    let router = app(state);
    let listener = tokio::net::TcpListener::bind(&listen).await?;
    tracing::info!("pdfsign-web listening on http://{listen}");
    axum::serve(listener, router).await?;
    Ok(())
}
