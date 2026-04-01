# Stage 1: Build the application
FROM node:20.19.5-bullseye AS builder

WORKDIR /app

# Set the script shell to sh, in case it's set to powershell on the host
RUN npm config set script-shell sh

# Install pnpm
RUN npm install -g pnpm

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Set environment variable for production build
# This tells Vite to use relative /api path instead of localhost:3001
ENV VITE_API_URL=/api

# Build the application for production
RUN pnpm run build

# Stage 2: Production server
FROM node:20.19.5-bullseye

WORKDIR /app

# Set timezone to Asia/Taipei
ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Copy built assets, serve script, and package files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/serve.cjs ./serve.cjs

# Install fonts for OG image rendering (CJK support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

# Install only the lightweight dependencies needed for serve.cjs
RUN npm install express@4 sharp@0.33

# Generate default OG image (SVG → PNG) — must await the async sharp call
RUN node -e "\
(async () => {\
  const sharp = require('sharp');\
  const fs = require('fs');\
  const svg = fs.readFileSync('./dist/og-default.svg');\
  await sharp(svg).resize(1200, 630).png({quality: 90}).toFile('./dist/og-default.png');\
  console.log('OG default image generated');\
})().catch(e => { console.error('OG image gen failed:', e.message); process.exit(1); });\
"

# Expose the port the app runs on
EXPOSE 13579

# Environment variables (can be overwritten in docker-compose)
ENV PORT=13579
ENV BACKEND_URL=http://backend:3001
ENV SITE_URL=https://koimsurai.com

# Start the custom server
CMD ["node", "serve.cjs"]
