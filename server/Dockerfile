# Use the official Node.js 18 Alpine image.
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Install build tools required for native modules like sqlite3
RUN apk add --no-cache python3 make g++

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application's source code from the host to the image's filesystem
COPY . .

# Expose the port the app runs on
EXPOSE 3001

# Command to run the application
CMD [ "npm", "run", "dev" ]
