"""按系统窗口列表里的真实位置截一张悬浮窗特写（避开窗口被系统挪位的问题）。"""
import json
import re
import subprocess
import sys
from pathlib import Path

import os
os.environ.pop("PYTHONPATH", None)
from PIL import Image  # noqa: E402

root = Path(__file__).resolve().parent.parent
out = root / "build" / (sys.argv[1] if len(sys.argv) > 1 else "shot.png")
margin = 18
info = subprocess.run([str(root / "build/wininfo")], capture_output=True, text=True).stdout
m = re.search(r'bounds=\[([^\]]*)\]', info)
if not m:
    print("no DshFloat window:", info.strip()[:200])
    sys.exit(1)
bounds = dict(re.findall(r'"(\w+)": ([\d.]+)', m.group(1)))
x, y, w, h = (float(bounds[k]) for k in ("X", "Y", "Width", "Height"))
shot = root / "build" / "_full.png"
subprocess.run(["screencapture", "-x", str(shot)], check=True)
im = Image.open(shot)
box = (int(x - margin), int(y - margin), int(x + w + margin), int(y + h + margin))
im.crop(box).resize((520, 520), Image.LANCZOS).save(out)
print(f"window at ({x},{y}) {w}x{h} -> {out}")
