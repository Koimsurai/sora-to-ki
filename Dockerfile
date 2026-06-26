# ─────────────────────────────────────────────────────────────
# P2: TanStack Start SSG/SSR — 打包(非建置)。
# dist 在 *host* 端先 build:`pnpm run build:start`(→ dist/client prerender + dist/server SSR handler)。
# 不在 Docker 內 prerender:其內部 render server 在 BuildKit 網路下 loopback(127.0.0.1)連不到 → ECONNREFUSED。
# 本映像只負責:裝 production 依賴 + 打包 dist + 跑 serve.mjs。
# 舊 SPA 版見 git 歷史(多階段 build + serve.cjs)。
# ─────────────────────────────────────────────────────────────
FROM node:20.19.5-bullseye
WORKDIR /app

ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 只裝 production 依賴。node-linker=hoisted:npm 式扁平 node_modules,讓 SSR bundle 的 split chunks
# 能解析到 transitive 外部依賴(如 react-fast-compare via react-helmet-async)——pnpm 嚴格佈局不提頂層會 ERR_MODULE_NOT_FOUND。
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN echo 'node-linker=hoisted' > .npmrc && pnpm install --prod --frozen-lockfile

# CJK 字型 — og-image 的 sharp SVG→PNG 要渲染中日文標題
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

# host 端 build:start 的產物 + 伺服器
COPY dist ./dist
COPY serve.mjs ./serve.mjs
# 防呆:忘了先在 host build → 明確失敗,別打包出殘缺映像
RUN test -f ./dist/server/server.js && test -d ./dist/client \
    || (echo "ERROR: dist 未建置。請先在 host 跑 'pnpm run build:start'" && exit 1)

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
