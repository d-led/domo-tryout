# Build stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

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
# Note: WS_SECRET is NOT injected at build time - placeholder remains in bundle.js
# Secret is injected at SERVE time by the server (more secure - not stored on disk)
ARG WS_SERVER_URL=
ARG VERSION=dev
# ARG values are automatically available as env vars during build

RUN npm run build

# Move dist to a non-gitignored location for copying between stages
RUN mkdir -p /build-output && \
    cp -r dist /build-output/dist

# Build stage 2: Install server dependencies
FROM node:22-alpine AS server-builder

WORKDIR /build-server

# Copy server package files
COPY server/package.json server/package-lock.json ./

# Install server dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Runtime stage
FROM node:22-alpine

# Use the existing node user (non-root, UID 1000)
WORKDIR /app

# Copy server dependencies from server-builder
COPY --from=server-builder --chown=node:node /build-server/node_modules ./node_modules

# Copy server application files
COPY --chown=node:node server/package.json server/package-lock.json server/server.js ./

# Copy built frontend from frontend-builder to dist/
COPY --from=frontend-builder --chown=node:node /build-output/dist ./dist

# Security notes:
# - WS_SECRET is injected at SERVE time (not build time) - secret not stored on disk
# - Backend is private (Flycast-only) and protected by OAuth2 proxy + origin checks
# - Server-side WS_SECRET check is optional (only if set via Fly secrets)
# - The glob vulnerability reported by Docker Scout is in npm's dependencies (base image)
#   and not in our production runtime (we only copy node_modules, not npm itself)

# Switch to non-root user
USER node

# Expose port
EXPOSE 9870

# Start the server
CMD ["node", "server.js"]

