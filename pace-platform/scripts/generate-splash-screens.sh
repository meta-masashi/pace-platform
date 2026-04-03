#!/bin/bash
# PACE Platform — iOS スプラッシュスクリーン生成スクリプト
#
# ImageMagick が必要: brew install imagemagick
#
# 使用方法: bash scripts/generate-splash-screens.sh
#
# emerald テーマカラー (#059669) の背景に PACE ロゴを中央配置する。

ICON="public/icons/icon-512.png"
OUTPUT_DIR="public/icons"
BG_COLOR="#059669"

SIZES=(
  "1290x2796"
  "1179x2556"
  "1170x2532"
  "1125x2436"
  "1242x2688"
)

echo "iOS スプラッシュスクリーン生成中..."

for size in "${SIZES[@]}"; do
  W="${size%x*}"
  H="${size#*x}"
  OUT="$OUTPUT_DIR/splash-${size}.png"

  if command -v convert &>/dev/null; then
    convert -size "${W}x${H}" "xc:${BG_COLOR}" \
      \( "$ICON" -resize 256x256 \) \
      -gravity center -composite "$OUT"
    echo "  生成: $OUT"
  else
    # ImageMagick がない場合は単色プレースホルダーを生成
    echo "  スキップ: ImageMagick が見つかりません ($OUT)"
  fi
done

echo "完了"
