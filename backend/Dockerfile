# koimsurai-web-backend（Rust）— anigamer 走 crates.io
# build context = web root（workspace：root Cargo.toml/lock + backend/）
FROM rust:1.97-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# host 的 ~/.cargo/config.toml（jobs=6 散熱上限）進不了容器 →
# 這裡明確設,避免 Docker build 用滿 16 執行緒燒機（94°C 那次的成因）。
ENV CARGO_BUILD_JOBS=6
COPY Cargo.toml Cargo.lock ./
COPY backend ./backend
# BuildKit 快取:target/ 與 cargo registry 跨 build 保留 → 依賴沒變就不重編（砍掉重複發熱/時間）。
# 注意:cache mount 不進 image 層,編完要把 binary cp 到非快取路徑,下一 stage 才複製得到。
RUN --mount=type=cache,target=/build/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release -p koimsurai-web-backend \
    && cp /build/target/release/koimsurai-web-backend /koimsurai-web-backend

FROM debian:bookworm-slim
# fonts-noto-cjk：OG 圖 SVG 光柵化字型；ca-certificates：對外 HTTPS；curl：healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY --from=builder /koimsurai-web-backend /usr/local/bin/koimsurai-web-backend
EXPOSE 3002
CMD ["koimsurai-web-backend"]
