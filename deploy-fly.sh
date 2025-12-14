#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Deploying to Fly.io..."
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
  echo "Error: fly CLI is not installed"
  echo "Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
  exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
  echo "Error: Not logged in to Fly.io"
  echo "Run: fly auth login"
  exit 1
fi

# This script deploys the backend app (domo-tryout-app)
# The proxy app (domo-tryout) is deployed separately
APP_NAME="domo-tryout-app"
FLY_TOML="server/fly.toml"

if [ ! -f "$FLY_TOML" ]; then
  echo "Error: $FLY_TOML not found. Make sure you're running from the project root."
  exit 1
fi

# Get WS_SECRET from environment variable (should be set in .zshrc)
# Generate a new one with: openssl rand -hex 32
if [ -z "$WS_SECRET" ]; then
  echo "Error: WS_SECRET environment variable is not set"
  echo "Add this to your ~/.zshrc:"
  echo "  export WS_SECRET=\"$(openssl rand -hex 32)\""
  echo ""
  echo "Then run: source ~/.zshrc"
  exit 1
fi

WS_SECRET_VALUE="$WS_SECRET"

# Check if WS_SECRET is set as a Fly secret (runtime env var for server)
WS_SECRET_SET=$(fly secrets list -a "$APP_NAME" 2>/dev/null | grep -q "^WS_SECRET" && echo "yes" || echo "no")

if [ "$WS_SECRET_SET" != "yes" ]; then
  echo "Setting WS_SECRET as Fly secret for app: $APP_NAME..."
  fly secrets set -a "$APP_NAME" WS_SECRET="$WS_SECRET_VALUE"
else
  echo "✓ WS_SECRET found in Fly secrets for app: $APP_NAME (will be used at runtime)"
fi

# Get the WebSocket server URL
# The frontend connects to the public proxy URL (domo-tryout.fly.dev), not the internal backend
# The proxy routes WebSocket connections to the backend internally via Flycast
WS_SERVER_URL="https://domo-tryout.fly.dev"
VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")

echo ""
echo "Build configuration:"
echo "  WS_SERVER_URL: $WS_SERVER_URL"
echo "  VERSION: $VERSION"
echo "  WS_SECRET: ${WS_SECRET_VALUE:+***set***}"
echo ""

# Build deploy command
DEPLOY_CMD="fly deploy -a $APP_NAME -c $FLY_TOML"
DEPLOY_CMD="$DEPLOY_CMD --build-arg WS_SERVER_URL=\"$WS_SERVER_URL\" --build-arg VERSION=\"$VERSION\""
if [ -n "$WS_SECRET_VALUE" ]; then
  DEPLOY_CMD="$DEPLOY_CMD --build-arg WS_SECRET=\"$WS_SECRET_VALUE\""
  echo "Deploying with WS_SECRET build arg..."
else
  echo "Deploying without WS_SECRET build arg (using default or runtime secret)..."
fi

echo "Deploying app: $APP_NAME"
eval $DEPLOY_CMD

echo ""
echo "Deployment complete!"
echo "Backend server: $APP_NAME (private, accessible via Flycast)"
echo "Public proxy: domo-tryout.fly.dev"
echo "WebSocket URL: $WS_SERVER_URL"
echo ""
echo "Note: This deploys the backend server ($APP_NAME) which is private."
echo "      The proxy app (domo-tryout) handles public access and OAuth2."
echo ""
echo "To manage secrets for this app:"
echo "  Set WS_SECRET: fly secrets set -a $APP_NAME WS_SECRET=your-secret"

