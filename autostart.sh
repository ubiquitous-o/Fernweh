#!/bin/bash
# Fernweh - Kiosk Mode Autostart（Ubuntu / macOS 両対応）
# ChromiumまたはChromeをキオスクモードで起動する。
# GitHub Pagesを直接表示する: videos.jsonはcronがPages上で2時間ごとに
# 更新し続けるため、キオスク機側でのgit pullもローカルサーバも不要。
# （ローカル開発・オフライン検証は `node server.js` + localhost:3333）

FERNWEH_URL="https://ubiquitous-o.github.io/Fernweh/"
DISPLAY_RES="3440x1440"
# キオスク専用プロファイル: 普段使いのChromeが起動中でも--kioskが確実に効く
# （既存インスタンスに相乗りするとフラグが無視されるため分離する）
PROFILE_DIR="$HOME/.fernweh-kiosk"

# 起動直後はWi-Fi等が未接続のことがあるため、ページ到達までリトライ
echo "⏳ ネットワーク接続を待っています..."
for i in $(seq 1 60); do
  if curl -s --max-time 5 "$FERNWEH_URL" > /dev/null 2>&1; then
    echo "✅ 接続確認"
    break
  fi
  sleep 2
done

OS="$(uname -s)"

# --- ブラウザ検出 ---
BROWSER=""
if [ "$OS" = "Darwin" ]; then
  # macOS: アプリバンドル内のバイナリを直接叩く（openだと--argsの管理が面倒）
  for CANDIDATE in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [ -x "$CANDIDATE" ]; then
      BROWSER="$CANDIDATE"
      break
    fi
  done
else
  # Ubuntu等
  for CANDIDATE in chromium-browser chromium google-chrome; do
    if command -v "$CANDIDATE" &> /dev/null; then
      BROWSER="$CANDIDATE"
      break
    fi
  done
fi

if [ -z "$BROWSER" ]; then
  echo "❌ Chromium/Chrome が見つからない"
  if [ "$OS" = "Darwin" ]; then
    echo "   https://www.google.com/chrome/ からインストール"
  else
    echo "   sudo apt install chromium-browser"
  fi
  exit 1
fi

# --- スリープ/スクリーンセーバー抑止 ---
if [ "$OS" != "Darwin" ]; then
  xset s off 2>/dev/null
  xset -dpms 2>/dev/null
  xset s noblank 2>/dev/null
fi
# macOSはcaffeinateでブラウザ実行中ずっとスリープ抑止（下のexecでラップ）

echo "🌍 Fernweh starting: $BROWSER"

BROWSER_ARGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-features=TranslateUI
  --autoplay-policy=no-user-gesture-required
  --window-size=${DISPLAY_RES/x/,}
  --start-fullscreen
  --user-data-dir="$PROFILE_DIR"
  "$FERNWEH_URL"
)

if [ "$OS" = "Darwin" ]; then
  # -d=ディスプレイ -i=アイドルスリープ -s=システムスリープを抑止
  exec caffeinate -dis "$BROWSER" "${BROWSER_ARGS[@]}"
else
  exec "$BROWSER" "${BROWSER_ARGS[@]}"
fi
