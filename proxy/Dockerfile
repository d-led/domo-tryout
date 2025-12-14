# Use a specific version tag for security (not :latest)
# Check https://quay.io/repository/oauth2-proxy/oauth2-proxy for latest stable version
FROM quay.io/oauth2-proxy/oauth2-proxy:v7.8.0

# oauth2-proxy runs on port 4180 by default
# The fly.toml configures OAUTH2_PROXY_HTTP_ADDRESS = "0.0.0.0:4180"
# All settings come from environment variables set in fly.toml

EXPOSE 4180

# The oauth2-proxy image already runs as non-root user
# No additional security hardening needed - the official image is production-ready

