# Stage 1: Build dependencies
FROM node:18-alpine AS builder

# Install build-time dependencies for sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

# Set the script shell to sh
RUN npm config set script-shell sh

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .


# Stage 2: Production
FROM node:18-alpine

# Install runtime dependencies (curl for healthcheck)
RUN apk add --no-cache curl

WORKDIR /usr/src/app

# Copy installed modules and application code from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app .

# Expose the application port
EXPOSE 3001

# The command to start the app in production
CMD ["npm", "start"]
