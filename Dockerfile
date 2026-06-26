# ─────────────────────────────────────────────────────────────
# P2: TanStack Start SSG/SSR。Stage 1 build → dist/client(prerender 靜態)+ dist/server(SSR handler);
# Stage 2 跑 serve.mjs(靜態服務 + SSR fallback + og-image/sitemap/robots)。
# 舊 SPA 版見 git 歷史(serve.cjs + `vite build`)。
# ─────────────────────────────────────────────────────────────

# Stage 1: Build
FROM node:20.19.5-bullseye AS builder
WORKDIR /app
RUN npm config set script-shell sh && npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# 客戶端 runtime 用相對 /api(經 nginx proxy 到 backend);build 時 vite.config.start.ts 另打 koimsurai.com/api 抓文章做 prerender
ENV VITE_API_URL=/api
RUN pnpm run build:start

# Stage 2: Production SSR server
FROM node:20.19.5-bullseye
WORKDIR /app

ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 只裝 production 依賴(SSR bundle 只外部依賴 react + @tanstack/react-router;og-image 需要 sharp)
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# CJK 字型 — og-image 的 sharp SVG→PNG 要渲染中日文標題
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

# 產物 + 伺服器
COPY --from=builder /app/dist ./dist
COPY serve.mjs ./serve.mjs

# 預設 OG 圖(SVG→PNG)+ PWA icons → dist/client(package.json 是 type:module,故 node -e 強制 commonjs 才能 require)
RUN node --input-type=commonjs -e "\
(async () => {\
  const sharp = require('sharp');\
  const fs = require('fs');\
  const C = './dist/client';\
  await sharp(fs.readFileSync(C + '/og-default-v2.svg')).resize(1200, 630).png({quality: 90}).toFile(C + '/og-default-v2.png');\
  const icon = fs.readFileSync(C + '/pwa-icon.svg');\
  await sharp(icon).resize(192, 192).png().toFile(C + '/pwa-192.png');\
  await sharp(icon).resize(512, 512).png().toFile(C + '/pwa-512.png');\
  await sharp(icon).resize(512, 512).png().toFile(C + '/pwa-maskable-512.png');\
  console.log('OG + PWA icons generated');\
})().catch(e => { console.error('Image gen failed:', e.message); process.exit(1); });\
"

EXPOSE 13579
ENV PORT=13579
ENV BACKEND_URL=http://backend:3001
ENV SITE_URL=https://koimsurai.com

CMD ["node", "serve.mjs"]
