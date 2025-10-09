# 使用官方 Node.js LTS Debian 映像作為基礎
FROM node:20-bullseye AS builder

# 在容器內建立並進入 /app 目錄
WORKDIR /app

# 僅複製 package.json 和 package-lock.json
# 這樣可以利用 Docker 的快取機制,只有在依賴變更時才重新安裝
COPY package*.json ./

# 複製專案所有其他檔案
# 因為有了 .dockerignore,這裡不會複製 node_modules
COPY . .

# 開放 Vite 開發伺服器預設的 port
# 您 package.json 是 13579,這裡保持一致
EXPOSE 13579

# 啟動開發伺服器時先安裝依賴
# 這樣可以確保每次啟動時都有最新的依賴
CMD sh -c "npm install --include=dev --legacy-peer-deps && npm run dev -- --host"