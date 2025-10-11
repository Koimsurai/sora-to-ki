# Stage 1: Build the application
FROM node:20-bullseye AS builder

WORKDIR /app

# Set the script shell to sh, in case it's set to powershell on the host
RUN npm config set script-shell sh

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Production server
FROM node:20-bullseye

WORKDIR /app

# Copy built assets and package files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install production dependencies
RUN npm install --production

# Expose the port the app runs on
EXPOSE 13579

# Start the app
CMD ["npx", "serve", "-s", "dist", "-l", "13579"]
