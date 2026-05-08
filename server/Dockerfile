FROM node:20-alpine

WORKDIR /usr/src/app

# Install build tools as a virtual package and runtime dependencies
# fonts: Noto CJK + Sans 提供 OG 動態圖中文字渲染
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    apk add --no-cache curl font-noto font-noto-cjk fontconfig && \
    fc-cache -f

# Set the script shell to sh
RUN npm config set script-shell sh

# Install pnpm globally (matches project-wide tooling)
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

# Install production dependencies (compiles native modules)
RUN pnpm install --prod --frozen-lockfile

COPY . .

# Remove the build dependencies to keep the image small
RUN apk del .build-deps

EXPOSE 3001

CMD ["pnpm", "start"]