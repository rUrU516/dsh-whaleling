// 列出当前屏幕上所有窗口的 owner / 名字 / 边界，用来确认悬浮窗到底在哪。
import CoreGraphics
import Foundation

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    print("no window list")
    exit(1)
}
for w in list {
    let owner = w[kCGWindowOwnerName as String] as? String ?? "?"
    let name = w[kCGWindowName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    let alpha = w[kCGWindowAlpha as String] as? Double ?? 0
    let number = w[kCGWindowNumber as String] as? Int ?? -1
    guard let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
    if owner.lowercased().contains("dshfloat") {
        print("FOUND id=\(number) owner=\(owner) layer=\(layer) alpha=\(alpha) bounds=\(b)")
    }
}
print("--- all owners ---")
print(Set(list.compactMap { $0[kCGWindowOwnerName as String] as? String }).sorted().joined(separator: ", "))
