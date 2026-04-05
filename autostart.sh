#!/bin/bash
# Fernweh - Kiosk Mode Autostart
# Ubuntu上でChromiumをキオスクモードで起動する

FERNWEH_URL="http://localhost:3333"
DISPLAY_RES="3440x1440"

# サーバーの起動を待つ
echo "⏳ サーバー起動を待っています..."
for i in $(seq 1 30); do
  if curl -s "$FERNWEH_URL" > /dev/null 2>&1; then
    echo "✅ サーバー起動確認"
    break
  fi
  sleep 1
done

# スクリーンセーバー無効化
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null

# Chromium をキオスクモードで起動
# （chromium-browser または google-chrome を使用）
BROWSER=""
if command -v chromium-browser &> /dev/null; then
  BROWSER="chromium-browser"
elif command -v chromium &> /dev/null; then
  BROWSER="chromium"
elif command -v google-chrome &> /dev/null; then
  BROWSER="google-chrome"
fi

if [ -z "$BROWSER" ]; then
  echo "❌ Chromium/Chrome が見つからない"
  echo "   sudo apt install chromium-browser"
  exit 1
fi

echo "🌍 Fernweh starting: $BROWSER"

exec $BROWSER \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --window-size=${DISPLAY_RES/x/,} \
  --start-fullscreen \
  "$FERNWEH_URL"
