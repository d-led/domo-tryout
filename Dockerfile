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
# Note: WS_SECRET is needed at BUILD TIME to inject into frontend bundle
# ARG values are available as environment variables during build automatically
# The secret is baked into the frontend code and not stored in image layers
# For Fly.io: WS_SECRET is passed via --build-arg during deployment
# Runtime secrets (if needed) are handled separately via Fly secrets
ARG WS_SECRET=wss-changeme
ARG WS_SERVER_URL=
ARG VERSION=dev
# ARG values are automatically available as env vars during build
# No need for ENV - build.js reads from process.env

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

# Note: WS_SECRET was injected at build time into the frontend bundle
# Runtime secret (if server needs it) should be passed via Fly secrets
# The build-time ARG is not available in the final image (by design)

# Switch to non-root user
USER node

# Expose port
EXPOSE 9870

# Start the server
CMD ["node", "server.js"]

