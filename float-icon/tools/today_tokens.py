"""统计「今天（本地自然日）」所有会话的 token 总数 —— 用来和 App 里显示的数字对照。

口径（和 main.swift 里的 TokenMeter 一致）：
- 只扫 mtime >= 今天 00:00 的 session.v4.jsonl.zstd
- 每个 assistant/message 事件里带一个 usage；
  同一行的 stream 里会再回放一份（chunk），所以**每行只取第一条**
- 只累加事件 time >= 今天 00:00 的
"""

import re
import subprocess
from datetime import datetime
from pathlib import Path

ZSTD = "/opt/homebrew/bin/zstd"
ROOT = Path.home() / ".dsh/sessions"

TOTAL = re.compile(r'"totalTokens":(\d+)')
TIME = re.compile(r'"time":(\d+)')


def start_of_today_ms() -> int:
    return int(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)


def human(n: int) -> str:
    for div, unit in ((1_000_000_000, "B"), (1_000_000, "M"), (1_000, "k")):
        if n >= div:
            text = f"{n / div:.1f}"
            if text.endswith(".0"):
                text = text[:-2]
            return text + unit
    return str(n)


def main() -> None:
    start = start_of_today_ms()
    files = [p for p in ROOT.rglob("session.v4.jsonl.zstd") if p.stat().st_mtime * 1000 >= start]
    if not files:
        print("files=0 events=0 total=0")
        print("display: 0")
        return

    out = subprocess.run([ZSTD, "-dc"] + [str(f) for f in files], capture_output=True).stdout
    total = 0
    events = 0
    for line in out.decode("utf-8", "replace").splitlines():
        if '"usage":{' not in line:
            continue
        m = TOTAL.search(line)
        t = TIME.search(line)
        if not m or not t or int(t.group(1)) < start:
            continue
        total += int(m.group(1))
        events += 1

    print(f"files={len(files)} events={events} total={total:,}")
    print(f"display: {human(total)}")


if __name__ == "__main__":
    main()
