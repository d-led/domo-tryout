#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="domo-tryout-test"
CONTAINER_NAME="domo-tryout-test-container"

echo "Building Docker image with local test configuration..."
docker build \
  --build-arg WS_SECRET="wss-changeme" \
  --build-arg WS_SERVER_URL="" \
  --build-arg VERSION="test" \
  -t "$IMAGE_NAME" .

echo "Stopping and removing existing container if it exists..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 9870:9870 \
  -e WS_SECRET="wss-changeme" \
  -e WS_SERVER_URL="" \
  -e VERSION="test" \
  "$IMAGE_NAME"

echo "Waiting for server to start..."
sleep 3

echo "Testing server health..."
if curl -f http://localhost:9870/version > /dev/null 2>&1; then
  echo "✓ Server is responding"
  VERSION=$(curl -s http://localhost:9870/version)
  echo "  Version: $VERSION"
else
  echo "✗ Server is not responding"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

echo "Testing static file serving..."
if curl -f http://localhost:9870/ > /dev/null 2>&1; then
  echo "✓ Static files are being served"
else
  echo "✗ Static files are not being served"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

echo ""
echo "Container is running. You can:"
echo "  - View logs: docker logs -f $CONTAINER_NAME"
echo "  - Stop container: docker stop $CONTAINER_NAME"
echo "  - Remove container: docker rm $CONTAINER_NAME"
echo ""
echo "Server is available at: http://localhost:9870"

