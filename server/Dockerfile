# Build stage
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Runtime stage
FROM node:20-alpine

# Use the existing node user (non-root, UID 1000)
# The node:20-alpine image already includes a node user
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=node:node /build/node_modules ./node_modules

# Copy application files
COPY --chown=node:node package.json server.js ./

# Switch to non-root user
USER node

# Expose port (will be set by fly.io)
EXPOSE 9870

# Start the server
CMD ["node", "server.js"]

