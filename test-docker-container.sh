#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONTAINER_NAME="domo-tryout-test-container"
BASE_URL="http://localhost:9870"
WS_URL="ws://localhost:9870"

echo "Running tests against Docker container..."
echo "Container: $CONTAINER_NAME"
echo "Base URL: $BASE_URL"
echo "WebSocket URL: $WS_URL"
echo ""

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "Error: Container $CONTAINER_NAME is not running"
  echo "Start it with: ./test-docker.sh"
  exit 1
fi

# Run Playwright tests with custom base URL
BASE_URL="$BASE_URL" WS_URL="$WS_URL" npm test -- --config=playwright.config.docker.ts

