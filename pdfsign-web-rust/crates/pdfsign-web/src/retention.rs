//! Hourly cleanup: delete expired document blobs and mark documents EXPIRED.

use crate::state::AppState;
use sqlx::FromRow;
use std::time::Duration;
use tokio::time::interval;

#[derive(FromRow)]
struct PurgeRow {
    id: String,
    public_id: String,
}

pub async fn purge_expired(state: &AppState) -> anyhow::Result<usize> {
    let rows = sqlx::query_as::<_, PurgeRow>(
        r#"SELECT id, public_id FROM documents
           WHERE purged_at IS NULL
             AND status <> 'PURGED'
             AND expires_at IS NOT NULL
             AND expires_at <= NOW()
           ORDER BY expires_at ASC
           LIMIT 200"#,
    )
    .fetch_all(&state.db)
    .await?;

    let mut n = 0usize;
    for row in rows {
        let keys: Vec<(String,)> =
            sqlx::query_as(r#"SELECT storage_key FROM document_versions WHERE document_id = $1"#)
                .bind(&row.id)
                .fetch_all(&state.db)
                .await?;

        for (key,) in keys {
            let path = state.storage.abs_path(&key);
            if let Err(e) = tokio::fs::remove_file(&path).await {
                if e.kind() != std::io::ErrorKind::NotFound {
                    tracing::warn!(%key, error = %e, "retention: failed to delete blob");
                }
            }
            // Also try removing empty parent dir (best-effort)
            if let Some(parent) = path.parent() {
                let _ = tokio::fs::remove_dir(parent).await;
            }
        }

        sqlx::query(
            r#"UPDATE documents
               SET status = 'EXPIRED', purged_at = NOW()
               WHERE id = $1"#,
        )
        .bind(&row.id)
        .execute(&state.db)
        .await?;
        n += 1;
        tracing::info!(doc = %row.public_id, "retention: purged expired document");
    }
    Ok(n)
}

pub fn spawn_cleanup_loop(state: AppState) {
    tokio::spawn(async move {
        // Run soon after boot, then hourly.
        let mut tick = interval(Duration::from_secs(3600));
        // First tick completes immediately
        loop {
            tick.tick().await;
            match purge_expired(&state).await {
                Ok(n) if n > 0 => tracing::info!(purged = n, "retention cleanup done"),
                Ok(_) => tracing::debug!("retention cleanup: nothing to purge"),
                Err(e) => tracing::error!(error = %e, "retention cleanup failed"),
            }
        }
    });
}
