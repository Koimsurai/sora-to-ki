# Stage 1: Build the application
FROM node:20-bullseye AS builder

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
FROM node:20-bullseye

WORKDIR /app

# Set timezone to Asia/Taipei
ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install pnpm
RUN npm install -g pnpm

# Copy built assets and package files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile

# Expose the port the app runs on
EXPOSE 13579

# Start the app
CMD ["npx", "serve", "-s", "dist", "-l", "13579"]
