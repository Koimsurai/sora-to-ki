# koimsurai-web-backend（Rust）— anigamer 走 crates.io
# build context = web root（workspace：root Cargo.toml/lock + backend/）
FROM rust:1.95-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY backend ./backend
RUN cargo build --release -p koimsurai-web-backend

FROM debian:bookworm-slim
# fonts-noto-cjk：OG 圖 SVG 光柵化字型；ca-certificates：對外 HTTPS；curl：healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY --from=builder /build/target/release/koimsurai-web-backend /usr/local/bin/koimsurai-web-backend
EXPOSE 3002
CMD ["koimsurai-web-backend"]
