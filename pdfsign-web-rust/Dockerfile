# Multi-stage: build Rust API + Vite UI. Context = repo root.
FROM node:20-bookworm AS ui
WORKDIR /src/pdfsign-web-rust/web
COPY pdfsign-web-rust/web/package.json pdfsign-web-rust/web/package-lock.json* ./
RUN npm install
COPY pdfsign-web-rust/web/ ./
RUN npm run build

FROM rust:1.85-bookworm AS api
WORKDIR /src
COPY pdfsign-signer-rust /src/pdfsign-signer-rust
COPY pdfsign-web-rust /src/pdfsign-web-rust
WORKDIR /src/pdfsign-web-rust
RUN cargo build --release -p pdfsign-web

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /src/pdfsign-web-rust/target/release/pdfsign-web /app/pdfsign-web
COPY --from=api /src/pdfsign-web-rust/migrations /app/migrations
COPY --from=ui /src/pdfsign-web-rust/web/dist /app/web/dist
ENV WEB_DIST=/app/web/dist
ENV STORAGE_DIR=/data/storage
EXPOSE 8080
CMD ["/app/pdfsign-web"]
