import AppKit
print("screen count:", NSScreen.screens.count)
for (i, s) in NSScreen.screens.enumerated() {
    print("screen[\(i)] frame=\(s.frame) visible=\(s.visibleFrame) scale=\(s.backingScaleFactor)")
}
if let m = NSScreen.main { print("main.frame=\(m.frame)") }
