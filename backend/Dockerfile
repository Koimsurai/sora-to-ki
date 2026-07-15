# koimsurai-web-backend（Rust strangler）
# build context = ~/Server（見 ~/Server/.dockerignore 白名單）——
# anigamer 是獨立 repo 的 path dep（../../anigamer-rs），context 拉高才收得進來。
# 容器內佈局 /build/web/backend + /build/anigamer-rs → 相對路徑對位。

FROM rust:1.95-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY anigamer-rs ./anigamer-rs
COPY web/Cargo.toml ./web/Cargo.toml
COPY web/backend ./web/backend
WORKDIR /build/web/backend
RUN cargo build --release

FROM debian:bookworm-slim
# fonts-noto-cjk：OG 圖 SVG 光柵化字型（resvg 吃系統字型）
# ca-certificates：對外 HTTPS；curl：healthcheck；tzdata：TZ=Asia/Taipei
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/*
# 與 Express 容器同 workdir——預設路徑（db/storage）一致
WORKDIR /usr/src/app
COPY --from=builder /build/web/target/release/koimsurai-web-backend /usr/local/bin/koimsurai-web-backend
EXPOSE 3002
CMD ["koimsurai-web-backend"]
