# Build stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /build-frontend

# Copy package files and build scripts
COPY package.json package-lock.json ./
COPY build.js ./
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY index.html ./

# Install all dependencies (including devDependencies for build)
RUN npm ci && \
    npm cache clean --force

# Build the frontend (creates dist/)
# Set build environment variables if needed
ARG WS_SECRET=wss-changeme
ARG WS_SERVER_URL=
ARG VERSION=dev
ENV WS_SECRET=${WS_SECRET}
ENV WS_SERVER_URL=${WS_SERVER_URL}
ENV VERSION=${VERSION}

RUN npm run build

# Move dist to a non-gitignored location for copying between stages
RUN mkdir -p /build-output && \
    cp -r dist /build-output/dist

# Build stage 2: Install server dependencies
FROM node:20-alpine AS server-builder

WORKDIR /build-server

# Copy server package files
COPY server/package.json server/package-lock.json ./

# Install server dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Runtime stage
FROM node:20-alpine

# Use the existing node user (non-root, UID 1000)
WORKDIR /app

# Copy server dependencies from server-builder
COPY --from=server-builder --chown=node:node /build-server/node_modules ./node_modules

# Copy server application files
COPY --chown=node:node server/package.json server/package-lock.json server/server.js ./

# Copy built frontend from frontend-builder to dist/
COPY --from=frontend-builder --chown=node:node /build-output/dist ./dist

# Switch to non-root user
USER node

# Expose port
EXPOSE 9870

# Start the server
CMD ["node", "server.js"]

