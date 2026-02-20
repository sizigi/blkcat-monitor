#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "Building web..."
cd packages/web
bunx vite build
cd ../..

echo "Starting server..."
exec bun packages/server/src/index.ts "$@"
