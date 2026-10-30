"""生成一张"肥皂泡"贴图：透明球心 + 亮边缘 + 左上高光 + 右下弱反光 + 一圈薄膜彩。

真实肥皂泡的彩色来自薄膜干涉：同一个泡上，颜色随**绕圈的方位角**变化，
而且饱和度不高（不然像塑料球）。这里就按方位角铺一圈低饱和的彩虹，只作用在亮边上。

输出 assets/bubble.png（128×128，RGBA）。参数都在下面，改完重跑即可。
"""

from pathlib import Path

import numpy as np
from PIL import Image

N = 128
R = 60.0
BASE = np.array([150, 200, 255], dtype=float)   # 球心：淡淡的天蓝
RIM = np.array([225, 240, 255], dtype=float)    # 边缘基色：近白偏蓝
HI = np.array([255, 255, 255], dtype=float)     # 高光

IRIDESCENCE = 0.62   # 彩虹掺进边缘的比例（0 = 纯白边）
SATURATION = 0.50    # 彩虹的饱和度（过高就像塑料球）
HUE_OFFSET = 0.08    # 整体色相偏移，让整批泡泡偏青蓝而不是全色相


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


yy, xx = np.mgrid[0:N, 0:N].astype(float)
dx = (xx + 0.5 - N / 2) / R
dy = (yy + 0.5 - N / 2) / R
d = np.hypot(dx, dy)
angle = np.arctan2(dy, dx)                      # -π..π
hue = (angle / (2 * np.pi) + 0.5 + HUE_OFFSET) % 1.0
rainbow = hsv_to_rgb(hue, SATURATION, 1.0) * 255.0

# 球心非常透，越靠边越实
fill = np.clip(1.0 - d, 0, 1) * 0.14
# 亮边：环在 ~0.86R
rim = np.exp(-((d - 0.86) / 0.115) ** 2) * 1.00
# 左上高光 + 右下弱反光
h1 = np.exp(-(((dx + 0.34) ** 2 + (dy + 0.36) ** 2) / (2 * 0.085 ** 2))) * 0.95
h2 = np.exp(-(((dx - 0.30) ** 2 + (dy - 0.34) ** 2) / (2 * 0.13 ** 2))) * 0.28

rim_rgb = RIM * (1 - IRIDESCENCE) + rainbow * IRIDESCENCE

alpha = np.clip(fill + rim + h1 + h2, 0, 1)
alpha[d > 1.0] = 0

wsum = fill + rim + h1 + h2 + 1e-6
rgb = (BASE * fill[..., None] + rim_rgb * rim[..., None] + HI * (h1 + h2)[..., None]) / wsum[..., None]

out = np.dstack([np.clip(rgb, 0, 255), (alpha * 255)]).astype(np.uint8)
dest = Path(__file__).resolve().parent.parent / "assets/bubble.png"
dest.parent.mkdir(exist_ok=True)
Image.fromarray(out, "RGBA").save(dest)
print("saved", dest, (N, N))
