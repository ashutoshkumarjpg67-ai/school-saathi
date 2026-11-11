#!/usr/bin/env bash
# Build the Capacitor webDir (www/) from the repo-root static site files.
# Repeatable: wipes www/ and re-copies from source, so www/ is always a
# fresh copy of the live site at the current version.
#
# Usage:  bash scripts/build-www.sh        (or: npm run build-www)
#
# Copies: index.html, app.js, styles.css, qrgen.js, manifest.json, sw.js,
#         version.json, js/ (modules), icons/ (app icons + logo).
# Never copies: node_modules/, supabase/, .git, android/, www/ itself,
#               package.json / package-lock.json / capacitor.config.json.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf "$ROOT/www"
mkdir -p "$ROOT/www/js/modules" "$ROOT/www/icons"

cp "$ROOT/index.html" \
   "$ROOT/app.js" \
   "$ROOT/styles.css" \
   "$ROOT/qrgen.js" \
   "$ROOT/manifest.json" \
   "$ROOT/sw.js" \
   "$ROOT/version.json" \
   "$ROOT/www/"

cp "$ROOT/js/modules/"*.js "$ROOT/www/js/modules/"
cp "$ROOT/icons/"* "$ROOT/www/icons/"

echo "www/ populated from $ROOT (version $(node -p "require('./version.json').version"))"
