FROM node:18-alpine

WORKDIR /usr/src/app

# Install build tools as a virtual package and runtime dependencies
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    apk add --no-cache curl

# Set the script shell to sh
RUN npm config set script-shell sh

COPY package*.json ./

# Install production dependencies (compiles native modules)
RUN npm install --production

COPY . .

# Remove the build dependencies to keep the image small
RUN apk del .build-deps

EXPOSE 3001

CMD ["npm", "start"]