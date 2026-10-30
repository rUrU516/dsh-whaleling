"""从 DSH 的 app 图标里抠出 DeepSeek 鲸鱼，做成透明底、纯色剪影。

思路：
1. 图标是「深色鲸鱼 + 近白底」。按亮度做软阈值，得到 alpha —— 保留抗锯齿边缘；
2. 鲸鱼身上有白色的眼睛/高光，直接抠会变成洞（墙纸会透出来）。用 flood fill
   从四角把「外部背景」标出来，剩下的透明区域就是内部洞，补成实心；
3. 按品牌色重新上色，裁到包围盒，输出 512x512。
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SRC = Path("/Applications/DeepSeek Harness.app/Contents/Resources/icon.png")
OUT_DIR = Path(__file__).parent / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BRAND = (77, 107, 254)  # #4D6BFE 品牌蓝

img = Image.open(SRC).convert("RGBA")
src_alpha = np.asarray(img)[..., 3].astype(np.float32) / 255.0
# 源图有 alpha（圆角图标），透明区域下面的 RGB 是黑的；先垫白底再算亮度，
# 否则四角会被当成「很暗的像素」留下来。
flat = Image.alpha_composite(Image.new("RGBA", img.size, (255, 255, 255, 255)), img).convert("RGB")
arr = np.asarray(flat).astype(np.float32)

# 亮度（感知加权）
lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]

# 软阈值：>=248 全透明，<=170 全不透明，中间线性
lo, hi = 170.0, 248.0
alpha = np.clip((hi - lum) / (hi - lo), 0.0, 1.0)
alpha8 = (alpha * src_alpha * 255).astype(np.uint8)
# 底色不是纯白（有浅灰渐变），会留下 alpha≈10 的薄雾；先把弱 alpha 直接归零，
# 否则 flood fill 找不到「连续的外部背景」，补洞会把整张图补成实心。
alpha8[alpha8 < 48] = 0

# --- 补洞：不做 -------------------------------------------------------
# 图标是「圆角白底 + 深色鲸鱼」，白底本身也是被浅灰描边围住的独立区域，
# 从四角 flood fill 只会填到描边外侧，反而把整块白底当成「洞」补实。
# 鲸鱼内部真正的洞只有眼睛和高光两处，很小，留着当高光更自然。
alpha_arr = alpha8.copy()

# --- 上色 -------------------------------------------------------------
rgb = np.zeros_like(arr)
rgb[..., 0], rgb[..., 1], rgb[..., 2] = BRAND
out = np.dstack([rgb, alpha_arr.astype(np.float32)]).astype(np.uint8)
whale = Image.fromarray(out, "RGBA")

# --- 裁到包围盒，留 6% 边距，输出 512 --------------------------------
bbox = whale.split()[3].getbbox()
whale = whale.crop(bbox)
# 不要再补边：贴图四周的留白会让鲸鱼在图标里显得小一圈
scale = 512.0 / max(whale.size)
whale = whale.resize((max(1, round(whale.width * scale)), max(1, round(whale.height * scale))), Image.LANCZOS)
whale.save(OUT_DIR / "whale.png")
print("bbox:", bbox, "-> saved", OUT_DIR / "whale.png", whale.size)
