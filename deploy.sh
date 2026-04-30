#!/bin/bash
# Deploy kitchen-web to production server
# Usage: bash deploy.sh

set -e

SERVER="root@47.76.250.17"
REMOTE_DIR="/var/www/kitchen"
SSH_KEY="$HOME/Downloads/密钥.pem"
LOCAL_DIR="$HOME/Desktop/projects/kitchen-web"

echo "🔨 Building..."
cd "$LOCAL_DIR"
npm run build

echo "📦 Rsyncing standalone output..."
rsync -avz --delete -e "ssh -i $SSH_KEY" \
  .next/standalone/ "$SERVER:$REMOTE_DIR/.next/standalone/"

echo "📦 Rsyncing public files..."
rsync -avz --delete -e "ssh -i $SSH_KEY" \
  public/ "$SERVER:$REMOTE_DIR/public/"

echo "📦 Rsyncing static files..."
rsync -avz --delete -e "ssh -i $SSH_KEY" \
  .next/static/ "$SERVER:$REMOTE_DIR/.next/static/"

echo "📦 Rsyncing .env..."
scp -i "$SSH_KEY" .env.production "$SERVER:$REMOTE_DIR/.env"

echo "🚀 Restarting service..."
ssh -i "$SSH_KEY" "$SERVER" "systemctl restart kitchen"

echo "✅ Deploy complete!"
