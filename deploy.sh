#!/bin/bash
# KAIRÓS Engine — VPS deploy script
# Run once on your VPS as root or a sudo user
# Usage: bash deploy.sh

set -e

APP_DIR="/opt/kairos-engine"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[KAIROS] Copying app files to $APP_DIR..."
mkdir -p "$APP_DIR"
rsync -av --exclude=node_modules --exclude=.next --exclude=.env "$REPO_DIR/" "$APP_DIR/"

echo "[KAIROS] Installing dependencies..."
cd "$APP_DIR"
npm install --production=false

echo "[KAIROS] Building Next.js..."
npm run build

echo "[KAIROS] Checking .env..."
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found. Create it from .env.example before running."
  exit 1
fi

echo "[KAIROS] Starting with PM2..."
pm2 delete kairos-engine 2>/dev/null || true
pm2 start npm --name "kairos-engine" -- start
pm2 save
pm2 startup | tail -1 | bash

echo "[KAIROS] Done. App running on port 3000."
pm2 status
