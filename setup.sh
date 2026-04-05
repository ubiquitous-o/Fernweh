#!/bin/bash
# Fernweh setup script
set -e

echo "🌍 Fernweh setup"
echo ""

# Node.js チェック
if ! command -v node &> /dev/null; then
  echo "❌ Node.js が見つからない"
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "   sudo apt install -y nodejs"
  exit 1
fi

echo "✅ Node.js $(node -v)"

# npm install
echo "📦 パッケージインストール..."
npm install

# config.json
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo ""
  echo "⚠  config.json を作成した。YouTube API キーを設定してね："
  echo "   nano config.json"
  echo ""
  echo "   API キーの取得:"
  echo "   https://console.cloud.google.com/ → API → YouTube Data API v3"
  echo ""
else
  echo "✅ config.json 存在確認"
fi

# autostart.sh 実行権限
chmod +x autostart.sh

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  セットアップ完了！                      │"
echo "│                                         │"
echo "│  1. config.json に API キーを設定        │"
echo "│  2. npm start で起動                    │"
echo "│  3. http://localhost:3333 を開く         │"
echo "│                                         │"
echo "│  常時起動の設定は README.md を参照       │"
echo "└─────────────────────────────────────────┘"
