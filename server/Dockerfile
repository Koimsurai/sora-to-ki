# 使用輕量的 Alpine Linux Node.js 映像 (與您之前在 compose 中使用的一致)
FROM node:18-alpine

# 安裝編譯 sqlite3 所需的系統依賴，以及 healthcheck 需要的 curl
# RUN 指令只會在建置映像檔時執行一次，這會大幅加快後續啟動速度
RUN apk add --no-cache python3 make g++ curl

# 設定工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 lock 檔案
# 這是為了利用 Docker 的快取機制
COPY package*.json ./

# 安裝 Node.js 依賴，並重建 sqlite3
# 同樣，這一步也只會在建置時執行
RUN npm install && npm rebuild sqlite3

# 複製所有後端原始碼到工作目錄
COPY . .

# 開放後端服務的端口
EXPOSE 3001

# 設定容器啟動時要執行的預設指令 (通常是啟動 nodemon)
CMD ["npm", "run", "dev"]