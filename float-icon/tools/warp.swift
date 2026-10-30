import CoreGraphics
let a = CommandLine.arguments
guard a.count >= 3, let x = Double(a[1]), let y = Double(a[2]) else { exit(1) }
CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
CGAssociateMouseAndMouseCursorPosition(1)
