#!/usr/bin/env bash
# generate-certs.sh — create a self-signed TLS certificate for local dev and server deployment.
#
# Usage (run from the project root):
#   bash scripts/generate-certs.sh                     # localhost only
#   bash scripts/generate-certs.sh 1.2.3.4             # + cloud public IP
#   bash scripts/generate-certs.sh myapp.example.com   # + domain
#   bash scripts/generate-certs.sh myapp.example.com 1.2.3.4  # both
#
# Produces:
#   certs/key.pem   — RSA private key  (never commit this)
#   certs/cert.pem  — self-signed X.509 certificate (825-day validity)
#
# localhost and 127.0.0.1 are always included. Extra IPs/domains are appended.
# Windows: run in Git Bash (OpenSSL ships with Git for Windows).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$PROJECT_ROOT/certs"

mkdir -p "$CERTS_DIR"

# Build the [alt_names] section dynamically.
# Always include localhost + 127.0.0.1; append each positional arg as IP or DNS.
ALT_NAMES="DNS.1 = localhost
DNS.2 = *.localhost
IP.1  = 127.0.0.1"

DNS_IDX=3
IP_IDX=2
for arg in "$@"; do
  # Detect IPv4 address (four dot-separated octets)
  if [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    ALT_NAMES="${ALT_NAMES}
IP.${IP_IDX}  = ${arg}"
    (( IP_IDX++ ))
  else
    ALT_NAMES="${ALT_NAMES}
DNS.${DNS_IDX} = ${arg}"
    (( DNS_IDX++ ))
  fi
done

# Use a config file instead of -subj/-addext flags.
# This avoids the Git Bash path-conversion problem with leading slashes in
# -subj arguments, and works across all OpenSSL versions.
CFG="$(mktemp /tmp/sv-openssl.XXXXXX.cnf)"
cat > "$CFG" << EOF
[req]
distinguished_name = dn
x509_extensions    = v3_req
prompt             = no
[dn]
CN = localhost
[v3_req]
subjectAltName = @alt_names
[alt_names]
${ALT_NAMES}
EOF

openssl req -x509 -newkey rsa:4096 -sha256 -days 825 -nodes \
  -keyout "$CERTS_DIR/key.pem" \
  -out    "$CERTS_DIR/cert.pem" \
  -config "$CFG"

rm -f "$CFG"

echo ""
echo "Generated:"
echo "  $CERTS_DIR/key.pem"
echo "  $CERTS_DIR/cert.pem"
echo ""
echo "First time in browser: open https://localhost:5173, click 'Advanced → Proceed'."
echo "To suppress the warning permanently, add certs/cert.pem to your OS trust store."
