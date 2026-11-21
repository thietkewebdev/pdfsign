//! One-shot retention purge for tests: `cargo run -p pdfsign-web --example purge_once`

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let state = pdfsign_web::build_state().await?;
    let n = pdfsign_web::retention::purge_expired(&state).await?;
    println!("purged={n}");
    Ok(())
}
