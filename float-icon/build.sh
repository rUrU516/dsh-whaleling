#!/bin/bash
# 编译并组装成 .app —— 必须用 .app + `open` 启动，
# 直接从 sandbox 里的 shell 跑二进制是连不上 WindowServer 的。
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p build/modulecache
xcrun swiftc -O -module-cache-path ./build/modulecache main.swift \
  -o build/DshFloat -framework Cocoa

APP=build/DshFloat.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build/DshFloat "$APP/Contents/MacOS/DshFloat"
cp assets/*.png "$APP/Contents/Resources/"
cp Info.plist "$APP/Contents/Info.plist"

echo "built: $APP"
