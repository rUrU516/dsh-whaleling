// DshFloat —— 独立进程 + 透明悬浮窗。
//
// 视觉：白色 DeepSeek 鲸鱼 + 两层不同周期的中性光晕。
// 交互：左键点一下展开/收起信息卡；拖动可移动；右键退出。
// 数据：读 ~/.dsh/sessions 下会话日志的 mtime，判断「有没有活跃会话」。
//
// 局限（故意写在最显眼处）：mtime 只能说明「最近写过」，
// 长思考但无写入的回合会被误判为空闲。真正的状态得走 DSH 自己的 API。

import Cocoa

// ── 可调参数 ──────────────────────────────────────────────────────────
let collapsedSide: CGFloat = 108        // 收起时的窗口边长
let iconBoxSide: CGFloat = 108          // 图标区域（光晕的舞台）边长
let iconSide: CGFloat = 66              // 鲸鱼边长
let cardSize = CGSize(width: 300, height: 104)
let expandedWidth: CGFloat = 320
let expandedHeight: CGFloat = 268

let tightPeriod: CFTimeInterval = 3.2   // 内圈光晕呼吸周期
let widePeriod: CFTimeInterval = 5.6    // 外圈光晕周期（不同步，避免机械感）
let activeWindow: TimeInterval = 8      // 日志多久之内写过算「活跃」（≈泡泡收尾延迟）
let showDailyTokens = false   // 先把当日 token 藏起来，代码留着
let ink = NSColor(white: 1.0, alpha: 1.0)
// ──────────────────────────────────────────────────────────────────────

// MARK: - 会话探测

struct SessionPulse {
    var active: Int = 0
    var lastAge: TimeInterval? = nil
}

/// 优先读 host 插件写出来的桥文件（真实 running 状态）；
/// 读不到 / 过期 / 插件没装，就退回按日志 mtime 猜。
func readBridge() -> SessionPulse? {
    let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".dsh/dshfloat-bridge.json")
    guard let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let at = obj["at"] as? Double,
          let running = obj["running"] as? Int else { return nil }
    // 桥每 1s 写一次；超过 6s 没更新说明 DSH 没在跑或插件没激活
    guard Date().timeIntervalSince1970 - at / 1000 < 6 else { return nil }
    var pulse = SessionPulse()
    pulse.active = running
    pulse.lastAge = 0
    return pulse
}

func scanSessions() -> SessionPulse {
    if let bridged = readBridge() { return bridged }

    let fm = FileManager.default
    let root = fm.homeDirectoryForCurrentUser.appendingPathComponent(".dsh/sessions")
    var pulse = SessionPulse()

    // 会话目录有两种命名（session-<uuid> / 裸 <uuid>），不按名字筛，直接找日志文件。
    guard let walker = fm.enumerator(at: root,
                                     includingPropertiesForKeys: [.contentModificationDateKey],
                                     options: [.skipsHiddenFiles]) else { return pulse }

    let now = Date()
    for case let url as URL in walker where url.lastPathComponent == "session.v4.jsonl.zstd" {
        guard let attrs = try? fm.attributesOfItem(atPath: url.path),
              let mtime = attrs[.modificationDate] as? Date else { continue }
        let age = now.timeIntervalSince(mtime)
        guard age <= activeWindow else { continue }
        pulse.active += 1
        pulse.lastAge = min(pulse.lastAge ?? age, age)
    }
    return pulse
}

// MARK: - 视图

final class GlowView: NSView {
    private let iconBox = CALayer()
    private let iconLayer = CALayer()
    private let tokenPill = CALayer()
    private let tokenLayer = CATextLayer()
    private let badge = CALayer()
    private let badgeText = CATextLayer()
    private let bubbleEmitter = CAEmitterLayer()

    private let card = CALayer()
    private let headline = CATextLayer()
    private let detail = CATextLayer()

    private var expanded = false
    private var running = 0
    private var pollTimer: Timer?

    override init(frame: NSRect) {
        super.init(frame: frame)
        build()
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    // MARK: 构建

    private func build() {
        wantsLayer = true
        layer = CALayer()
        layer?.backgroundColor = NSColor.clear.cgColor

        iconBox.frame = CGRect(x: 0, y: 0, width: iconBoxSide, height: iconBoxSide)
        layer?.addSublayer(iconBox)


        if let url = assetURL("whale.png"), let image = NSImage(contentsOf: url) {
            var rect = CGRect(origin: .zero, size: image.size)
            iconLayer.contents = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
        } else {
            NSLog("DshFloat: 找不到 whale.png")
        }
        iconLayer.contentsGravity = .resizeAspect
        iconLayer.magnificationFilter = .linear
        iconLayer.minificationFilter = .trilinear
        // 今日 token：常驻胶囊。用半透明「黑」而不是白——
        // 白底白字在浅色背景上一样会消失，深色底才能两种背景都读得清。
        tokenPill.backgroundColor = NSColor(calibratedRed: 0.30, green: 0.42, blue: 1.0, alpha: 0.88).cgColor
        tokenPill.borderWidth = 0
        tokenPill.cornerRadius = 4
        iconBox.addSublayer(tokenPill)

        tokenLayer.alignmentMode = .center
        tokenLayer.font = TokenFonts.badge
        tokenLayer.fontSize = 9
        tokenLayer.foregroundColor = NSColor(white: 1.0, alpha: 0.97).cgColor
        tokenLayer.contentsScale = 2
        tokenLayer.string = ""
        tokenPill.addSublayer(tokenLayer)

        // 未读角标：贴在鲸鱼左肩，红底白字
        badge.backgroundColor = NSColor(calibratedRed: 1.0, green: 0.23, blue: 0.19, alpha: 0.96).cgColor
        badge.borderWidth = 0.6
        badge.borderColor = NSColor(white: 1.0, alpha: 0.35).cgColor
        badge.cornerRadius = 6.5
        badge.isHidden = true
        iconBox.addSublayer(badge)

        badgeText.alignmentMode = .center
        badgeText.font = NSFont.monospacedDigitSystemFont(ofSize: 8, weight: .bold)
        badgeText.fontSize = 8
        badgeText.foregroundColor = NSColor.white.cgColor
        badgeText.contentsScale = 2
        badge.addSublayer(badgeText)

        // 不再画外圈光晕：光只从鲸鱼自己身上渗出来
        iconLayer.shadowColor = NSColor(calibratedRed: 0.30, green: 0.42, blue: 1.0, alpha: 1.0).cgColor
        iconLayer.shadowOpacity = 0.30
        iconLayer.shadowRadius = 7
        iconLayer.shadowOffset = .zero
        iconBox.addSublayer(iconLayer)

        buildBubbles()

        // 信息卡（收起时隐藏）
        card.frame = CGRect(origin: .zero, size: cardSize)
        card.backgroundColor = NSColor(white: 1.0, alpha: 0.07).cgColor
        card.cornerRadius = 18
        card.borderWidth = 1
        card.borderColor = NSColor(white: 1.0, alpha: 0.14).cgColor
        card.opacity = 0
        layer?.addSublayer(card)

        for layer in [headline, detail] {
            layer.alignmentMode = .center
            layer.foregroundColor = NSColor.white.cgColor
            layer.truncationMode = .end
        }
        headline.fontSize = 15
        headline.font = CTFontCreateWithName("PingFangSC-Semibold" as CFString, 15, nil)
        detail.fontSize = 11
        detail.font = CTFontCreateWithName("PingFangSC-Regular" as CFString, 11, nil)
        detail.foregroundColor = NSColor(white: 1.0, alpha: 0.55).cgColor
        card.addSublayer(headline)
        card.addSublayer(detail)

        startBreathing()
    }

    private func buildBubbles() {
        bubbleEmitter.emitterShape = .circle
        bubbleEmitter.emitterMode = .outline
        bubbleEmitter.birthRate = 0
        bubbleEmitter.emitterCells = [makeBubble()]
        iconBox.addSublayer(bubbleEmitter)
    }

    private func makeBubble() -> CAEmitterCell {
        let cell = CAEmitterCell()
        // 128px 的「肥皂泡」贴图：亮边 + 左上高光 + 近透明的球心
        if let url = assetURL("bubble.png"), let image = NSImage(contentsOf: url) {
            var rect = CGRect(origin: .zero, size: image.size)
            cell.contents = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
        }
        // ── 一点浮力物理 ──────────────────────────────────────────
        // 层是 flipped 的：+y 朝下，所以「向上」= 负方向。
        // 初速给得小、且带随机；之后靠 yAcceleration 持续加速（浮力）；
        // 上升过程中 scaleSpeed 让泡变大（气压降低），alphaSpeed 让它变淡（壁变薄）。
        // ── 一点浮力物理（方向是实测的，不要凭直觉改）──────────────────
        // 这个 lay：+y 朝上。所以「向上」是正数。
        // 初速小且随机 → 之后持续向上加速 → 边升边变大 → 慢慢变淡。
        cell.birthRate = 1.8
        cell.lifetime = 2.4
        cell.lifetimeRange = 0.6
        cell.velocity = 8                 // 刚吐出来很慢
        cell.velocityRange = 6            // ← 初始速度的随机性
        cell.emissionLongitude = .pi / 2  // 朝上
        cell.emissionRange = .pi / 8      // 吐出的方向也散一点
        cell.yAcceleration = 10           // 浮力：持续向上加速
        cell.xAcceleration = 0
        cell.scale = 0.028                // 刚出来只有 ~3.6px
        cell.scaleRange = 0.012           // 起始大小也有随机性
        cell.scaleSpeed = 0.056           // 越升越大（终态约 5 倍，和之前一样大）
        cell.alphaSpeed = -0.45           // 慢慢变淡
        cell.alphaRange = 0.15
        cell.spin = 0.4                   // 缓慢自转，让高光跟着晃
        cell.spinRange = 0.9
        // 每颗泡泡的色调微调，避免一起出来像复制粘贴
        cell.redRange = 0.10; cell.greenRange = 0.10; cell.blueRange = 0.10
        // 让气泡从图标下缘往上飘
        return cell
    }

    // MARK: 布局

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let w = bounds.width, h = bounds.height
        iconBox.frame = CGRect(x: (w - iconBoxSide) / 2, y: h - iconBoxSide, width: iconBoxSide, height: iconBoxSide)
        iconLayer.frame = CGRect(
            x: (iconBoxSide - iconSide) / 2,
            y: (iconBoxSide - iconSide) / 2,
            width: iconSide, height: iconSide
        )
        // 从嘴巴附近吐：鲸鱼朝左，嘴在图标左中偏下
        bubbleEmitter.emitterPosition = CGPoint(
            x: iconBoxSide / 2 - iconSide * 0.30,
            y: iconBoxSide / 2 - iconSide * 0.02
        )
        bubbleEmitter.emitterSize = CGSize(width: 3, height: 1)

        card.frame = CGRect(x: (w - cardSize.width) / 2, y: 14, width: cardSize.width, height: cardSize.height)
        let inset: CGFloat = 18
        headline.frame = CGRect(x: inset, y: cardSize.height - 46, width: cardSize.width - inset * 2, height: 24)
        detail.frame = CGRect(x: inset, y: cardSize.height - 74, width: cardSize.width - inset * 2, height: 20)
        CATransaction.commit()
    }

    // MARK: 呼吸

    private func startBreathing() {
        // 呼吸的是「鲸鱼自己发的那点光」，不是外圈光晕
        let breathe = CABasicAnimation(keyPath: "shadowOpacity")
        breathe.fromValue = 0.16
        breathe.toValue = 0.55
        breathe.duration = tightPeriod
        breathe.autoreverses = true
        breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        iconLayer.add(breathe, forKey: "breathe")

        let swell = CABasicAnimation(keyPath: "transform.scale")
        swell.fromValue = 1.0
        swell.toValue = 1.022
        swell.duration = tightPeriod
        swell.autoreverses = true
        swell.repeatCount = .infinity
        swell.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        iconLayer.add(swell, forKey: "swell")
    }

    private func addBreath(to layer: CALayer, from: CGFloat, to: CGFloat, period: CFTimeInterval, key: String) {
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = from
        pulse.toValue = to
        pulse.duration = period
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        layer.add(pulse, forKey: key)
    }

    // MARK: 数据刷新

    var onAcknowledge: (() -> Void)?
    var onTogglePanel: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onDragMoved: (() -> Void)?
    private var lifted = false

    private var pressStart: NSPoint?
    private var windowStart: NSPoint?
    private var isDragging = false

    private var unreadCount = 0
    private var badgeSuppressed = false

    func setBadgeSuppressed(_ suppressed: Bool) {
        badgeSuppressed = suppressed
        if suppressed { badge.isHidden = true } else { setUnread(unreadCount) }
    }

    func setUnread(_ count: Int) {
        unreadCount = count
        guard count > 0, !badgeSuppressed else {
            if !badge.isHidden { badge.isHidden = true }
            return
        }
        let text = count > 99 ? "99+" : "\(count)"
        let width: CGFloat = count > 9 ? 15 : 13

        badgeText.string = text
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        badge.frame = CGRect(x: 19, y: 72, width: width, height: 13)
        badgeText.frame = CGRect(x: 0, y: 1.5, width: width, height: 10)
        CATransaction.commit()

        if badge.isHidden {
            badge.isHidden = false
            let pop = CABasicAnimation(keyPath: "transform.scale")
            pop.fromValue = 0.4
            pop.toValue = 1.0
            pop.duration = 0.32
            pop.timingFunction = CAMediaTimingFunction(name: .easeOut)
            badge.add(pop, forKey: "pop")
        }
    }

    func setTokens(_ total: Int) {
        guard showDailyTokens else {
            tokenPill.isHidden = true
            return
        }
        let text = TokenMeter.human(total)
        let textWidth = ceil((text as NSString).size(withAttributes: [.font: TokenFonts.badge]).width)
        // 底座宽度对齐鲸鱼（约 58pt）；数字更长时才跟着长
        let width = max(58, textWidth + 12)
        let height: CGFloat = 13

        tokenLayer.string = text
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // 鲸鱼实际底边在 26.5pt（66 宽 × 426/512 高），底座顶边贴到 24
        tokenPill.frame = CGRect(x: (iconBoxSide - width) / 2, y: 11, width: width, height: height)
        tokenLayer.frame = CGRect(x: 0, y: (height - 11) / 2 + 0.5, width: width, height: 11)
        CATransaction.commit()
    }

    /// 展开时鲸鱼轻轻上浮一点，给面板腾位置
    func setLifted(_ value: Bool) {
        guard value != lifted else { return }
        lifted = value
        let target = value
            ? CATransform3DConcat(CATransform3DMakeTranslation(0, 8, 0),
                                  CATransform3DMakeScale(1.03, 1.03, 1))
            : CATransform3DIdentity
        let anim = CABasicAnimation(keyPath: "transform")
        anim.fromValue = iconLayer.presentation()?.transform ?? iconLayer.transform
        anim.toValue = target
        anim.duration = 0.52
        anim.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.9, 0.25, 1)
        if value { iconLayer.removeAnimation(forKey: "swell") } else { startBreathing() }
        iconLayer.transform = target
        iconLayer.add(anim, forKey: "lift")
    }

    func setRunning(_ count: Int) {
        guard count != running else { return }
        running = count
        updateBubbles()
        updateCardText()
    }

    private func updateCardText() {
        if running > 0 {
            headline.string = "\(running) 个会话活跃"
            detail.string = ""
        } else {
            headline.string = "暂无活跃会话"
            detail.string = "有任务跑起来就会冒泡"
        }
    }

    private func updateBubbles() {
        let want: Float = running > 0 ? 1 : 0
        guard bubbleEmitter.birthRate != want else { return }
        // 别硬切：起的时候缓 1.1s 渐入，停的时候缓 1.8s 收尾，
        // 已经在飞的泡泡靠自己的 alphaSpeed 淡掉，不会突然消失。
        let duration: CFTimeInterval = want > 0 ? 1.1 : 1.8
        let from = bubbleEmitter.presentation()?.birthRate ?? bubbleEmitter.birthRate
        let anim = CABasicAnimation(keyPath: "birthRate")
        anim.fromValue = from
        anim.toValue = want
        anim.duration = duration
        anim.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        bubbleEmitter.birthRate = want
        bubbleEmitter.add(anim, forKey: "birthRate")
    }


    // MARK: 展开/收起

    func toggleExpanded() {
        expanded.toggle()
        guard let window else { return }
        let old = window.frame
        let newSize = expanded
            ? CGSize(width: expandedWidth, height: expandedHeight)
            : CGSize(width: collapsedSide, height: collapsedSide)
        // 顶边中心点不动，向下/向两侧展开
        let anchorTop = old.maxY
        let anchorMidX = old.midX
        let newFrame = CGRect(
            x: anchorMidX - newSize.width / 2,
            y: anchorTop - newSize.height,
            width: newSize.width,
            height: newSize.height
        )
        // 贴边时把窗口推回可见区域，否则会被系统裁小
        var target = newFrame
        if let vis = (window.screen ?? NSScreen.screens.first)?.visibleFrame {
            if target.maxX > vis.maxX { target.origin.x = vis.maxX - target.width }
            if target.minX < vis.minX { target.origin.x = vis.minX }
            if target.minY < vis.minY { target.origin.y = vis.minY }
        }
        window.setFrame(target, display: true, animate: true)

        CATransaction.begin()
        CATransaction.setAnimationDuration(0.22)
        card.opacity = expanded ? 1 : 0
        CATransaction.commit()

    }

    // MARK: 交互

    // 单击拖拽；双击把 DSH 叫到前台。开合交给悬停。
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            pressStart = nil
            windowStart = nil
            isDragging = false
            onDoubleClick?()
            return
        }
        pressStart = NSEvent.mouseLocation
        windowStart = window?.frame.origin
        isDragging = false
    }

    override func mouseDragged(with event: NSEvent) {
        guard let start = pressStart, let origin = windowStart else { return }
        let now = NSEvent.mouseLocation
        let dx = now.x - start.x
        let dy = now.y - start.y
        if !isDragging, hypot(dx, dy) < 3 { return }
        isDragging = true
        var next = NSPoint(x: origin.x + dx, y: origin.y + dy)
        if let vis = (window?.screen ?? NSScreen.screens.first)?.visibleFrame {
            next.x = min(max(next.x, vis.minX - 40), vis.maxX - 68)
            next.y = min(max(next.y, vis.minY - 40), vis.maxY - 68)
        }
        window?.setFrameOrigin(next)
        onDragMoved?()
    }

    override func mouseUp(with event: NSEvent) {
        pressStart = nil
        windowStart = nil
        isDragging = false
    }

    @objc private func clearUnread() {
        onAcknowledge?()
    }

    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu()
        let quit = NSMenuItem(title: "退出悬浮窗", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        quit.target = NSApp
        menu.addItem(quit)
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }
}

func assetURL(_ name: String) -> URL? {
    let ns = name as NSString
    if let url = Bundle.main.url(forResource: ns.deletingPathExtension, withExtension: ns.pathExtension) {
        return url
    }
    let exeDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    let candidates = [
        exeDir.appendingPathComponent(name),
        exeDir.deletingLastPathComponent().appendingPathComponent("assets/\(name)"),
        exeDir.deletingLastPathComponent().appendingPathComponent("Resources/\(name)"),
    ]
    for url in candidates where FileManager.default.fileExists(atPath: url.path) {
        return url
    }
    return nil
}


// MARK: - 字体

enum TokenFonts {
    /// SF Pro Text + 等宽数字：9pt 下比圆体锐利，且 9.9M→10.1M 宽度不变。
    static let badge: NSFont = NSFont.monospacedDigitSystemFont(ofSize: 9, weight: .semibold)
}

// MARK: - 扫描：今日 token + 未读提醒

/// 一趟扫描同时产出两样东西：
///   1) 今日 token 总数（按本地自然日、全部工作区）
///   2) 每个会话最近的 turn/end 序号 —— 用来判断「有没有跑完但我没看到」
///
/// 注意「未读」不是真已读：DSH 不记录用户打开过哪个会话，
/// 所以我们自己维护「已确认到第几个 turn/end」，用户切回 DSH 时清空。
final class TokenMeter {
    private let queue = DispatchQueue(label: "dshfloat.scan", qos: .utility)
    private var lastSignature = ""
    private var lastScanAt: Date = .distantPast
    private var busy = false
    private var timer: Timer?

    private var confirmed: [String: Int] = [:]
    private var latest: [String: Int] = [:]
    private var stateReady = false

    var onTokens: ((Int) -> Void)?
    var onUnread: ((Int) -> Void)?

    private static let zstdPaths = ["/opt/homebrew/bin/zstd", "/usr/local/bin/zstd", "/usr/bin/zstd"]
    private static let dshBundleId = "com.deepseek.dsh"

    func start() {
        loadState()
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.tick()
        }
        tick()

        // 切回 DSH 就当作「看过了」
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil, queue: .main
        ) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == Self.dshBundleId else { return }
            self?.acknowledge()
        }
    }

    // MARK: 节流

    private func tick() {
        guard !busy else { return }
        let files = Self.recentLogs()
        let signature = files.map { "\($0.lastPathComponent):\(Self.mtimeMs($0))" }.joined()
        let todayStart = Self.startOfTodayMs()

        if signature == lastSignature, Date().timeIntervalSince(lastScanAt) < 300 { return }
        if Date().timeIntervalSince(lastScanAt) < 20 { return }

        busy = true
        queue.async { [weak self] in
            guard let self else { return }
            let result = Self.scan(files: files, since: todayStart)
            DispatchQueue.main.async {
                self.lastSignature = signature
                self.lastScanAt = Date()
                self.busy = false
                self.apply(result)
            }
        }
    }

    private func apply(_ result: ScanResult) {
        latest = result.turnEnds

        // 第一次跑：把现存的所有完成都当作「已看」，否则一启动就一堆红点
        if !stateReady {
            stateReady = true
            if confirmed.isEmpty {
                confirmed = latest
                saveState()
            }
        }

        onTokens?(result.total)

        // DSH 在前台 = 你正看着它，直接判为已读；
        // 否则才算「你切走了，它自己跑完了」。
        let dshFront = NSWorkspace.shared.frontmostApplication?.bundleIdentifier == Self.dshBundleId
        if dshFront {
            if confirmed != latest { confirmed = latest; saveState() }
            onUnread?(0)
        } else {
            onUnread?(unreadCount())
        }

        let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "nil"
        let debug = "{\"files\": \(result.files), \"events\": \(result.events), \"total\": \(result.total), \"unread\": \(unreadCount()), \"front\": \(front)}"
        try? debug.write(to: Bundle.main.bundleURL.deletingLastPathComponent()
            .appendingPathComponent("token-debug.json"), atomically: true, encoding: .utf8)
    }

    private func unreadCount() -> Int {
        latest.reduce(0) { acc, pair in
            acc + ((pair.value > (confirmed[pair.key] ?? 0)) ? 1 : 0)
        }
    }

    func acknowledge() {
        guard stateReady else { return }
        confirmed = latest
        saveState()
        onUnread?(0)
    }

    // MARK: 状态持久化

    private static var stateURL: URL {
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/DshFloat", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("unread.json")
    }

    private func loadState() {
        guard let data = try? Data(contentsOf: Self.stateURL),
              let map = try? JSONDecoder().decode([String: Int].self, from: data) else { return }
        confirmed = map
    }

    private func saveState() {
        guard let data = try? JSONEncoder().encode(confirmed) else { return }
        try? data.write(to: Self.stateURL, options: .atomic)
    }

    // MARK: 扫描实现

    struct ScanResult {
        var total = 0
        var events = 0
        var files = 0
        var turnEnds: [String: Int] = [:]
    }

    private static func recentLogs() -> [URL] {
        let fm = FileManager.default
        let root = fm.homeDirectoryForCurrentUser.appendingPathComponent(".dsh/sessions")
        let since = min(startOfTodayMs(), Int64((Date().timeIntervalSince1970 - 12 * 3600) * 1000))
        var out: [URL] = []
        guard let walker = fm.enumerator(at: root,
                                         includingPropertiesForKeys: [.isRegularFileKey],
                                         options: [.skipsHiddenFiles]) else { return out }
        for case let url as URL in walker where url.lastPathComponent == "session.v4.jsonl.zstd" {
            if mtimeMs(url) >= since { out.append(url) }
        }
        return out
    }

    private static func mtimeMs(_ url: URL) -> Int64 {
        let ms = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date
        return Int64((ms ?? .distantPast).timeIntervalSince1970 * 1000)
    }

    private static func startOfTodayMs() -> Int64 {
        Int64(Calendar.current.startOfDay(for: Date()).timeIntervalSince1970 * 1000)
    }

    private static func scan(files: [URL], since: Int64) -> ScanResult {
        var result = ScanResult()
        result.files = files.count
        guard !files.isEmpty,
              let zstd = zstdPaths.first(where: { FileManager.default.isExecutableFile(atPath: $0) })
        else { return result }

        for file in files {
            let sessionId = file.deletingLastPathComponent().lastPathComponent
                .replacingOccurrences(of: "session-", with: "")

            let process = Process()
            process.executableURL = URL(fileURLWithPath: zstd)
            process.arguments = ["-dc", file.path]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice
            do { try process.run() } catch { continue }

            var pending = Data()
            let handle = pipe.fileHandleForReading
            while true {
                let chunk = handle.availableData
                if chunk.isEmpty { break }
                pending.append(chunk)
                if let cut = pending.lastIndex(of: 0x0A) {
                    let head = pending[pending.startIndex..<cut]
                    let r = parse(String(decoding: head, as: UTF8.self), since: since)
                    result.total += r.total
                    result.events += r.events
                    if r.maxTurnEnd > (result.turnEnds[sessionId] ?? 0) {
                        result.turnEnds[sessionId] = r.maxTurnEnd
                    }
                    pending = Data(pending[pending.index(after: cut)...])
                }
            }
            if !pending.isEmpty {
                let r = parse(String(decoding: pending, as: UTF8.self), since: since)
                result.total += r.total
                result.events += r.events
                if r.maxTurnEnd > (result.turnEnds[sessionId] ?? 0) {
                    result.turnEnds[sessionId] = r.maxTurnEnd
                }
            }
            process.waitUntilExit()
        }
        return result
    }

    /// 闭包不能捕获 inout，所以这里返回局部结果，由调用方合并。
    private static func parse(_ text: String, since: Int64) -> (total: Int, events: Int, maxTurnEnd: Int) {
        var total = 0
        var events = 0
        var maxTurnEnd = 0
        text.enumerateLines { line, _ in
            if line.contains("\"usage\":{") {
                // 同一行里 stream 会回放一份 usage，只取第一条（事件级）
                if let tokens = intValue(in: line, after: "\"totalTokens\":"),
                   let time = intValue(in: line, after: "\"time\":"), time >= since {
                    total += Int(tokens)
                    events += 1
                }
            }
            if line.contains("\"type\":\"turn/end\""),
               let seq = intValue(in: line, after: "\"seq\":") {
                maxTurnEnd = max(maxTurnEnd, Int(seq))
            }
        }
        return (total, events, maxTurnEnd)
    }

    private static func intValue(in line: String, after marker: String) -> Int64? {
        guard let range = line.range(of: marker) else { return nil }
        var value: Int64 = 0
        var digits = 0
        var idx = range.upperBound
        while idx < line.endIndex, let d = line[idx].wholeNumberValue, d >= 0, d <= 9 {
            value = value * 10 + Int64(d)
            digits += 1
            idx = line.index(after: idx)
        }
        return digits > 0 ? value : nil
    }

    /// 12.4k / 215.2M / 1.3B，一位小数，整数不带 .0
    static func human(_ n: Int) -> String {
        let d = Double(n)
        let unit: String
        let scaled: Double
        if d >= 1_000_000_000 { (scaled, unit) = (d / 1_000_000_000, "B") }
        else if d >= 1_000_000 { (scaled, unit) = (d / 1_000_000, "M") }
        else if d >= 1_000 { (scaled, unit) = (d / 1_000, "k") }
        else { return "\(n)" }
        var text = String(format: "%.1f", scaled)
        if text.hasSuffix(".0") { text.removeLast(2) }
        return text + unit
    }
}


// MARK: - 桥：running + 未读（按事件时间判断当时是否在看 DSH）

final class BridgeMeter {
    private var timer: Timer?
    private var focused = false
    private var timeline: [(since: Date, focused: Bool)] = []
    private var unread = 0
    private var processedUntil: TimeInterval = 0      // 毫秒时间戳
    private var savedUnread = -1

    var onRunning: ((Int) -> Void)?
    var onUnread: ((Int) -> Void)?
    var onSessions: (([[String: Any]]) -> Void)?
    private(set) var sessions: [[String: Any]] = []

    private static let dshBundleId = "com.deepseek.dsh"
    private static var fileURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dsh/dshfloat-bridge.json")
    }
    private static var stateURL: URL {
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/DshFloat", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("unread-v2.json")
    }

    func start() {
        focused = NSWorkspace.shared.frontmostApplication?.bundleIdentifier == Self.dshBundleId
        timeline = [(Date(), focused)]
        load()

        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let self,
                  let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            else { return }
            let isDSH = app.bundleIdentifier == Self.dshBundleId
            self.record(isDSH)
            if isDSH { self.acknowledge() }
        }

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.poll()
        }
        poll()
    }

    private func record(_ value: Bool) {
        guard value != focused else { return }
        focused = value
        timeline.append((Date(), value))
        if timeline.count > 800 { timeline.removeFirst(300) }
    }

    /// 事件发生时（不是读到它时）DSH 是不是前台
    private func wasFocused(at date: Date) -> Bool {
        guard let first = timeline.first else { return focused }
        if date < first.since { return first.focused }
        var result = first.focused
        for entry in timeline where entry.since <= date { result = entry.focused }
        return result
    }

    private func poll() {
        guard let data = try? Data(contentsOf: Self.fileURL),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let at = obj["at"] as? Double,
              Date().timeIntervalSince1970 - at / 1000 < 6
        else {
            // 桥不可用：泡泡退回按日志 mtime 猜，未读保持原样
            onRunning?(scanSessions().active)
            return
        }

        onRunning?(obj["running"] as? Int ?? 0)

        if let list = obj["list"] as? [[String: Any]] {
            sessions = list
            onSessions?(list)
        }

        if let ends = obj["ends"] as? [[String: Any]] {
            var fresh: [(time: TimeInterval, id: String)] = []
            for e in ends {
                guard let ms = e["time"] as? Double, ms > processedUntil else { continue }
                fresh.append((ms / 1000, e["id"] as? String ?? ""))
            }
            fresh.sort { $0.time < $1.time }
            for event in fresh {
                processedUntil = max(processedUntil, event.time * 1000)
                if !wasFocused(at: Date(timeIntervalSince1970: event.time)) {
                    unread += 1
                }
            }
            if !fresh.isEmpty {
                onUnread?(unread)
                save()
            }
        }

        if focused { acknowledge() }

        let dbg: [String: Any] = ["focused": focused, "running": obj["running"] as? Int ?? -1,
                                  "unread": unread, "processedUntil": processedUntil,
                                  "ends": (obj["ends"] as? [[String: Any]])?.count ?? -1]
        if let d = try? JSONSerialization.data(withJSONObject: dbg) {
            try? d.write(to: Bundle.main.bundleURL.deletingLastPathComponent()
                .appendingPathComponent("bridge-debug.json"), options: .atomic)
        }
    }

    func acknowledge() {
        let nowMs = Date().timeIntervalSince1970 * 1000
        if unread != 0 {
            unread = 0
            onUnread?(0)
        }
        processedUntil = max(processedUntil, nowMs)
        save()
    }

    // MARK: 持久化

    private func load() {
        guard let data = try? Data(contentsOf: Self.stateURL),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let until = obj["processedUntil"] as? Double
        else {
            // 第一次跑：把历史事件都当已读，别一启动就一堆红点
            processedUntil = Date().timeIntervalSince1970 * 1000
            save()
            return
        }
        processedUntil = until
        unread = obj["unread"] as? Int ?? 0
        savedUnread = unread
        if unread > 0 { onUnread?(unread) }
    }

    private func save() {
        guard unread != savedUnread else {
            // 只有 processedUntil 变了也要落盘，但不必每次都写
            return
        }
        savedUnread = unread
        let payload: [String: Any] = ["unread": unread, "processedUntil": processedUntil]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        try? data.write(to: Self.stateURL, options: .atomic)
    }
}


// MARK: - 展开面板（玻璃 + 会话列表 + 最后一条回复）

/// 那个经典的小圆圈 spinner：一段圆弧绕中心转。
final class SpinnerView: NSView {
    private let ring = CAShapeLayer()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        ring.fillColor = NSColor.clear.cgColor
        ring.strokeColor = NSColor(white: 1.0, alpha: 0.55).cgColor
        ring.lineWidth = 1.5
        ring.lineCap = .round
        ring.strokeStart = 0
        ring.strokeEnd = 0.72
        layer?.addSublayer(ring)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func layout() {
        super.layout()
        ring.frame = bounds
        ring.path = CGPath(ellipseIn: bounds.insetBy(dx: 1.5, dy: 1.5), transform: nil)
    }

    func start() {
        guard ring.animation(forKey: "spin") == nil else { return }
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = -2 * Double.pi
        spin.duration = 1.1
        spin.repeatCount = .infinity
        ring.add(spin, forKey: "spin")
    }

    func stop() {
        ring.removeAnimation(forKey: "spin")
    }
}

/// 一行会话：左边 spinner（在跑）或空心圆，标题，右边时间。
final class SessionRow: NSView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let timeLabel = NSTextField(labelWithString: "")
    private let spinner = SpinnerView(frame: .zero)
    private let highlight = CALayer()
    private var tracking: NSTrackingArea?

    var onSelect: (() -> Void)?

    init(title: String, time: String, running: Bool) {
        super.init(frame: .zero)
        wantsLayer = true

        highlight.backgroundColor = NSColor(white: 1.0, alpha: 0.06).cgColor
        highlight.cornerRadius = 6
        highlight.isHidden = true
        layer?.addSublayer(highlight)

        spinner.isHidden = !running
        addSubview(spinner)
        if running { spinner.start() }

        titleLabel.stringValue = title
        titleLabel.font = .systemFont(ofSize: 12.5)
        titleLabel.textColor = NSColor(white: 1.0, alpha: 0.90)
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.maximumNumberOfLines = 1
        addSubview(titleLabel)

        timeLabel.stringValue = time
        timeLabel.font = .systemFont(ofSize: 11)
        timeLabel.textColor = NSColor(white: 1.0, alpha: 0.42)
        timeLabel.alignment = .right
        addSubview(timeLabel)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func layout() {
        super.layout()
        let h = bounds.height
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        highlight.frame = bounds.insetBy(dx: 2, dy: 2)
        CATransaction.commit()

        spinner.frame = CGRect(x: 9, y: (h - 14) / 2, width: 14, height: 14)

        let timeWidth: CGFloat = 54
        timeLabel.frame = CGRect(x: bounds.width - timeWidth - 12, y: (h - 15) / 2, width: timeWidth, height: 15)
        let left: CGFloat = 28
        titleLabel.frame = CGRect(
            x: left, y: (h - 17) / 2,
            width: max(10, bounds.width - left - timeWidth - 20), height: 17
        )
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self)
        addTrackingArea(area)
        tracking = area
    }

    override func mouseEntered(with event: NSEvent) { highlight.isHidden = false }
    override func mouseExited(with event: NSEvent) { highlight.isHidden = true }
    override func mouseDown(with event: NSEvent) { onSelect?() }
}


/// SF Symbols 里没有 folder.open。照 DSH 那个画：**描边**，背板 + 向前倾的前盖。
func openFolderImage(size: CGFloat = 14) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
        let k = rect.width / 14.0
        func p(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: x * k, y: y * k) }

        let back = NSBezierPath()
        back.move(to: p(1.6, 3.7))
        back.line(to: p(1.6, 10.8))
        back.line(to: p(5.1, 10.8))
        back.line(to: p(6.5, 9.0))
        back.line(to: p(12.4, 9.0))
        back.line(to: p(12.4, 3.7))
        back.close()

        let front = NSBezierPath()
        front.move(to: p(1.2, 6.4))
        front.line(to: p(11.4, 6.4))
        front.line(to: p(12.9, 2.4))
        front.line(to: p(2.7, 2.4))
        front.close()

        NSColor.black.setStroke()
        for path in [back, front] {
            path.lineWidth = 1.15
            path.lineJoinStyle = .round
            path.lineCapStyle = .round
            path.stroke()
        }
        return true
    }
    image.isTemplate = true
    return image
}

/// 工作区分组头：文件夹图标 + 名称，点击折叠/展开。
final class GroupRow: NSView {
    private let icon = NSImageView()
    private let label = NSTextField(labelWithString: "")
    private let highlight = CALayer()
    private var tracking: NSTrackingArea?

    var onToggle: (() -> Void)?

    init(name: String, running: Bool, expanded: Bool) {
        super.init(frame: .zero)
        wantsLayer = true
        highlight.backgroundColor = NSColor(white: 1.0, alpha: 0.06).cgColor
        highlight.cornerRadius = 6
        highlight.isHidden = true
        layer?.addSublayer(highlight)

        icon.image = expanded
            ? openFolderImage()
            : NSImage(systemSymbolName: "folder", accessibilityDescription: nil)
        icon.contentTintColor = running
            ? NSColor(calibratedRed: 0.42, green: 0.56, blue: 1.0, alpha: 1.0)
            : NSColor(white: 1.0, alpha: 0.55)
        icon.imageScaling = .scaleProportionallyDown
        addSubview(icon)

        label.stringValue = name
        label.font = .systemFont(ofSize: 12.5, weight: .medium)
        label.textColor = NSColor(white: 1.0, alpha: 0.72)
        label.lineBreakMode = .byTruncatingTail
        label.maximumNumberOfLines = 1
        addSubview(label)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        highlight.frame = bounds.insetBy(dx: 2, dy: 2)
        CATransaction.commit()
        let h = bounds.height
        icon.frame = CGRect(x: 8, y: (h - 14) / 2, width: 14, height: 14)
        label.frame = CGRect(x: 28, y: (h - 17) / 2, width: bounds.width - 40, height: 17)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self)
        addTrackingArea(area)
        tracking = area
    }

    override func mouseEntered(with event: NSEvent) { highlight.isHidden = false }
    override func mouseExited(with event: NSEvent) { highlight.isHidden = true }
    override func mouseDown(with event: NSEvent) { onToggle?() }
}


/// 顶边中间凹一个坑的圆角矩形：鲸鱼坐在坑里，而不是盖在边上。
func notchedPanelPath(size: CGSize, radius: CGFloat, notchWidth: CGFloat, notchDepth: CGFloat) -> CGPath {
    let w = size.width, h = size.height, cx = w / 2, nx = notchWidth / 2
    let path = CGMutablePath()
    path.move(to: CGPoint(x: radius, y: h))
    path.addLine(to: CGPoint(x: cx - nx, y: h))
    path.addQuadCurve(
        to: CGPoint(x: cx, y: h - notchDepth),
        control: CGPoint(x: cx - nx * 0.72, y: h - notchDepth * 1.05)
    )
    path.addQuadCurve(
        to: CGPoint(x: cx + nx, y: h),
        control: CGPoint(x: cx + nx * 0.72, y: h - notchDepth * 1.05)
    )
    path.addLine(to: CGPoint(x: w - radius, y: h))
    path.addArc(tangent1End: CGPoint(x: w, y: h), tangent2End: CGPoint(x: w, y: h - radius), radius: radius)
    path.addLine(to: CGPoint(x: w, y: radius))
    path.addArc(tangent1End: CGPoint(x: w, y: 0), tangent2End: CGPoint(x: w - radius, y: 0), radius: radius)
    path.addLine(to: CGPoint(x: radius, y: 0))
    path.addArc(tangent1End: CGPoint(x: 0, y: 0), tangent2End: CGPoint(x: 0, y: radius), radius: radius)
    path.addLine(to: CGPoint(x: 0, y: h - radius))
    path.addArc(tangent1End: CGPoint(x: 0, y: h), tangent2End: CGPoint(x: radius, y: h), radius: radius)
    path.closeSubpath()
    return path
}


/// 只画「鲸鱼左右两侧往下」的框，顶边中间那段（正下方）留空不画。
func openTopBorderPath(size: CGSize, radius: CGFloat, notchWidth: CGFloat) -> CGPath {
    let w = size.width, h = size.height, cx = w / 2, nx = notchWidth / 2
    let path = CGMutablePath()
    path.move(to: CGPoint(x: cx - nx, y: h))
    path.addLine(to: CGPoint(x: radius, y: h))
    path.addArc(tangent1End: CGPoint(x: 0, y: h), tangent2End: CGPoint(x: 0, y: h - radius), radius: radius)
    path.addLine(to: CGPoint(x: 0, y: radius))
    path.addArc(tangent1End: CGPoint(x: 0, y: 0), tangent2End: CGPoint(x: radius, y: 0), radius: radius)
    path.addLine(to: CGPoint(x: w - radius, y: 0))
    path.addArc(tangent1End: CGPoint(x: w, y: 0), tangent2End: CGPoint(x: w, y: radius), radius: radius)
    path.addLine(to: CGPoint(x: w, y: h - radius))
    path.addArc(tangent1End: CGPoint(x: w, y: h), tangent2End: CGPoint(x: w - radius, y: h), radius: radius)
    path.addLine(to: CGPoint(x: cx + nx, y: h))
    return path
}


/// 跟手的柔光点：用 NSView 定位，坐标系交给 AppKit，避免手算翻转
final class GlowDotView: NSView {
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        let g = CAGradientLayer()
        g.type = .radial
        g.frame = bounds
        g.colors = [
            NSColor(calibratedRed: 0.68, green: 0.82, blue: 1.0, alpha: 0.85).cgColor,
            NSColor(calibratedRed: 0.62, green: 0.78, blue: 1.0, alpha: 0.12).cgColor,
            NSColor(calibratedRed: 0.62, green: 0.78, blue: 1.0, alpha: 0).cgColor,
        ]
        g.locations = [0, 0.4, 1]
        layer = g
        alphaValue = 0
    }
    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }   // 不吃鼠标事件

    override func layout() {
        super.layout()
        layer?.frame = bounds          // layer-hosting：图层尺寸得自己跟
    }
}

final class PanelController: NSObject, NSTextViewDelegate {
    private let window: NSWindow
    private let effect: NSVisualEffectView
    private var container: NSView!
    private var revealMask: CALayer!
    private var border: CAShapeLayer!
    private var runner: CAShapeLayer!
    private let spot = GlowDotView(frame: NSRect(x: 0, y: 0, width: 180, height: 180))
    private let spotB = GlowDotView(frame: NSRect(x: 0, y: 0, width: 180, height: 180))
    private let rippleLayer = CALayer()
    private var lastRingAt = Date.distantPast
    private var lastRingPoint = CGPoint.zero
    private let scroll = NSScrollView()
    private let listContainer = FlippedView()
    private let detailView = NSTextView()
    private var rows: [SessionRow] = []
    private let pageSize = 6          // 一页几个工作区
    private var visibleGroups = 6
    private var collapsed: Set<String> = []
    private var sessions: [[String: Any]] = []
    private var anchor: NSRect = .zero

    weak var bridge: BridgeMeter?

    static func panelPath(size: CGSize) -> CGPath {
        notchedPanelPath(size: size, radius: 18, notchWidth: 62, notchDepth: 16)
    }

    private static let bodyFont = NSFont.systemFont(ofSize: 12)
    private static let dimFont = NSFont.systemFont(ofSize: 11)
    private static let strong = NSColor(white: 1.0, alpha: 0.92)
    private static let dim = NSColor(white: 1.0, alpha: 0.50)
    private static let accent = NSColor(calibratedRed: 0.42, green: 0.56, blue: 1.0, alpha: 1.0)

    override init() {
        let rect = NSRect(x: 0, y: 0, width: 300, height: 420)
        window = NSWindow(contentRect: rect, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        // 比面板高一级：展开后鲸鱼必须骑在面板顶边上，不依赖窗口顺序
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .darkAqua)

        effect = NSVisualEffectView(frame: rect)
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active
        // 保留圆角和鲸鱼凹槽，仅将轮廓内侧的 1.25pt 轻微羽化。
        // destinationOut 只减遮罩 alpha，不往玻璃上叠加任何颜色或描边。
        let shape = Self.panelPath(size: rect.size)
        let maskImage = NSImage(size: rect.size, flipped: false) { _ in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            ctx.addPath(shape)
            ctx.setFillColor(NSColor.black.cgColor)
            ctx.fillPath()
            ctx.addPath(shape)
            ctx.clip()
            ctx.setBlendMode(.destinationOut)
            let steps = 12
            for step in 0..<steps {
                ctx.setLineWidth(2 * 1.25 * CGFloat(steps - step) / CGFloat(steps))
                ctx.setStrokeColor(NSColor(white: 0, alpha: 1 / CGFloat(steps - step + 1)).cgColor)
                ctx.addPath(shape)
                ctx.strokePath()
            }
            return true
        }
        effect.maskImage = maskImage
        effect.wantsLayer = true

        let border = CAShapeLayer()
        border.frame = rect
        border.path = openTopBorderPath(size: rect.size, radius: 18, notchWidth: 62)
        border.lineCap = .round
        border.fillColor = nil
        border.strokeColor = NSColor(calibratedRed: 0.48, green: 0.60, blue: 1.0, alpha: 0.55).cgColor
        border.lineWidth = 1.2
        // 不显示任何描边；保留图层以免改变原有动画时序。
        border.isHidden = true
        self.border = border

        // 绕圈跑的一束荧光：用虚线相位滚动，天然循环
        runner = CAShapeLayer()
        runner.frame = rect
        runner.path = border.path
        runner.fillColor = nil
        runner.strokeColor = NSColor(calibratedRed: 0.66, green: 0.78, blue: 1.0, alpha: 0.95).cgColor
        runner.lineWidth = 2.0
        runner.lineCap = .round
        runner.lineDashPattern = [46, 1600]
        runner.shadowColor = NSColor(calibratedRed: 0.45, green: 0.6, blue: 1.0, alpha: 1.0).cgColor
        runner.shadowRadius = 6
        runner.shadowOpacity = 0.9
        runner.opacity = 0

        scroll.frame = rect.insetBy(dx: 8, dy: 10)
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = false      // 不要滚动条，滑到底自动续
        scroll.autohidesScrollers = true
        scroll.borderType = .noBorder
        scroll.autoresizingMask = [.width, .height]

        detailView.drawsBackground = false
        detailView.isEditable = false
        detailView.isSelectable = true
        detailView.textContainerInset = NSSize(width: 6, height: 6)
        detailView.linkTextAttributes = [.foregroundColor: Self.accent, .underlineStyle: 0]

        effect.addSubview(scroll)
        // 边框放在容器层上，不放进 effect：否则会被 maskImage 一起渐隐掉
        let container = NSView(frame: rect)
        container.wantsLayer = true
        container.addSubview(effect)
        container.layer?.anchorPoint = CGPoint(x: 0.5, y: 1.0)
        container.layer?.position = CGPoint(x: rect.width / 2, y: rect.height)
        container.layer?.addSublayer(border)

        self.container = container

        // 跟手的柔光点（水波的底色）
        rippleLayer.frame = rect
        container.layer?.addSublayer(rippleLayer)
        container.addSubview(spot)
        spotB.layer?.setValue([NSColor.systemOrange.cgColor,
                               NSColor.systemOrange.withAlphaComponent(0.15).cgColor,
                               NSColor.clear.cgColor], forKey: "colors")
        container.addSubview(spotB)

        revealMask = CALayer()
        revealMask.backgroundColor = NSColor.black.cgColor
        revealMask.anchorPoint = CGPoint(x: 0.5, y: 1.0)
        revealMask.position = CGPoint(x: rect.width / 2, y: rect.height)
        revealMask.bounds = CGRect(x: 0, y: 0, width: rect.width, height: rect.height)
        effect.layer?.mask = revealMask
        window.contentView = container
        super.init()
        detailView.delegate = self

        scroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self, selector: #selector(onScroll),
            name: NSView.boundsDidChangeNotification, object: scroll.contentView
        )
    }

    func update(_ list: [[String: Any]]) {
        sessions = list
        guard window.isVisible else { return }
        if scroll.documentView === listContainer { rebuildRows() }
    }

    func toggle(near rect: NSRect) {
        anchor = rect
        if visible { hide() } else { show() }
    }

    /// 展开态拖拽时跟着鲸鱼走（不做动画，直接跟手）
    func follow(_ rect: NSRect) {
        anchor = rect
        guard window.isVisible else { return }
        window.setFrameOrigin(Self.origin(for: rect, size: window.frame.size))
    }

    private static func origin(for whale: NSRect, size: CGSize) -> CGPoint {
        // 面板顶边中点 = 鲸鱼中心上浮 8pt 之后的位置
        CGPoint(x: whale.midX - size.width / 2, y: whale.midY + 8 - size.height)
    }

    func show() {
        showList()
        let size = window.frame.size

        // 边框：从鲸鱼左侧开始描，绕过底部到右侧合拢
        border.removeAllAnimations()
        border.strokeStart = 0
        border.strokeEnd = 0
        let draw = CABasicAnimation(keyPath: "strokeEnd")
        draw.fromValue = 0
        draw.toValue = 1
        draw.duration = 0.62
        draw.timingFunction = CAMediaTimingFunction(controlPoints: 0.35, 0, 0.2, 1)
        border.strokeEnd = 1
        border.add(draw, forKey: "draw")

        // 玻璃 + 内容：自上而下擦出来
        revealMask.removeAllAnimations()
        revealMask.bounds = CGRect(x: 0, y: 0, width: size.width, height: size.height)
        let wipe = CABasicAnimation(keyPath: "bounds.size.height")
        wipe.fromValue = 0
        wipe.toValue = size.height
        wipe.duration = 0.5
        wipe.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.7, 0.25, 1)
        revealMask.add(wipe, forKey: "wipe")

        window.setFrameOrigin(Self.origin(for: anchor, size: size))
        window.orderFrontRegardless()
        window.alphaValue = 1
        visible = true

        // 始终禁用窗口阴影：展开结束后重新开启会沿玻璃轮廓生成黑色细边。
    }

    /// 鼠标在面板上划过：柔光跟手，并按移动距离丢出涟漪
    func pointerMoved(to screenPoint: NSPoint) {
        pollReply()
        guard visible else { return }
        // 两步转换，让 AppKit 处理窗口/视图坐标的翻转
        let inWindow = window.convertPoint(fromScreen: screenPoint)
        let point = container.convert(inWindow, from: nil)
        // 诊断：蓝色用原值，橙色用翻转值。哪颗在手指下就是哪套坐标对。
        spot.setFrameOrigin(NSPoint(x: point.x - spot.frame.width / 2,
                                    y: point.y - spot.frame.height / 2))
        let flippedY = container.bounds.height - point.y
        spotB.setFrameOrigin(NSPoint(x: point.x - spotB.frame.width / 2,
                                     y: flippedY - spotB.frame.height / 2))
        spot.alphaValue = 0
        spotB.alphaValue = 0

        // 涟漪：和光点同一套坐标，保证两者对得上
        // 只有移动才触发；已经放出去的环自己跑完，和后续鼠标无关
        let now = Date()
        let moved = hypot(point.x - lastRingPoint.x, point.y - lastRingPoint.y)
        if moved > 22, now.timeIntervalSince(lastRingAt) > 0.11 {
            lastRingAt = now
            lastRingPoint = point
            _ = point   // 涟漪暂停，先不生成
        }


    }

    func pointerExited() {
        spot.alphaValue = 0
        spotB.alphaValue = 0
    }

    private func spawnRing(at point: CGPoint) {
        let ring = CAShapeLayer()
        let d: CGFloat = 30
        ring.frame = CGRect(x: point.x - d / 2, y: point.y - d / 2, width: d, height: d)
        ring.path = CGPath(ellipseIn: ring.bounds, transform: nil)
        ring.fillColor = nil
        ring.strokeColor = NSColor(calibratedRed: 0.66, green: 0.80, blue: 1.0, alpha: 0.6).cgColor
        ring.lineWidth = 1.0
        container.layer?.addSublayer(ring)

        let grow = CABasicAnimation(keyPath: "transform.scale")
        grow.fromValue = 0.3
        grow.toValue = 3.0
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.9
        fade.toValue = 0
        for a in [grow, fade] {
            a.duration = 1.6
            a.timingFunction = CAMediaTimingFunction(name: .easeOut)
            ring.add(a, forKey: a.keyPath)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.62) { ring.removeFromSuperlayer() }
    }

    private func startSweep() {
        runner.opacity = 1
        guard runner.animation(forKey: "sweep") == nil else { return }
        let sweep = CABasicAnimation(keyPath: "lineDashPhase")
        sweep.fromValue = 0
        sweep.toValue = 1646            // 46 + 1600，正好一个循环
        sweep.duration = 3.4
        sweep.repeatCount = .infinity
        sweep.timingFunction = CAMediaTimingFunction(name: .linear)
        runner.add(sweep, forKey: "sweep")
    }

    func hide() {
        guard window.isVisible else { return }
        visible = false
        window.hasShadow = false
        let size = window.frame.size

        let retract = CABasicAnimation(keyPath: "strokeEnd")
        retract.fromValue = border.presentation()?.strokeEnd ?? 1
        retract.toValue = 0
        retract.duration = 0.34
        retract.timingFunction = CAMediaTimingFunction(controlPoints: 0.5, 0, 0.7, 0.3)
        border.strokeEnd = 0
        border.add(retract, forKey: "draw")

        let unwrap = CABasicAnimation(keyPath: "bounds.size.height")
        unwrap.fromValue = revealMask.presentation()?.bounds.height ?? size.height
        unwrap.toValue = 0
        unwrap.duration = 0.3
        unwrap.timingFunction = CAMediaTimingFunction(controlPoints: 0.5, 0, 0.7, 0.3)
        revealMask.bounds = CGRect(x: 0, y: 0, width: size.width, height: 0)
        revealMask.add(unwrap, forKey: "wipe")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) { [weak self] in
            guard let self, !self.visible else { return }
            self.window.orderOut(nil)
            self.revealMask.bounds = CGRect(x: 0, y: 0, width: size.width, height: size.height)
            self.border.strokeEnd = 1
        }
    }

    private(set) var visible = false

    var frame: NSRect { window.frame }

    // MARK: 列表

    private func showList() {
        visibleGroups = pageSize
        rebuildRows()
        scroll.documentView = listContainer
        scroll.contentView.scroll(to: .zero)
    }

    private func rebuildRows() {
        // 清空整个容器：组头、标题、行都在这里，只 remove 某一种类型会叠影
        listContainer.subviews.forEach { $0.removeFromSuperview() }
        rows.removeAll()

        let width = scroll.contentSize.width
        var y: CGFloat = 6

        let header = NSTextField(labelWithString: "会话")
        header.font = .systemFont(ofSize: 13, weight: .semibold)
        header.textColor = Self.strong
        header.frame = CGRect(x: 12, y: y, width: width - 24, height: 20)
        listContainer.addSubview(header)
        y += 28

        // 按工作区分组，组内按时间倒序，组之间也按各自最新时间倒序
        var groups: [String: [[String: Any]]] = [:]
        for session in sessions {
            let cwd = (session["cwd"] as? String) ?? ""
            let key = cwd.isEmpty ? "其他" : (cwd as NSString).lastPathComponent
            groups[key, default: []].append(session)
        }
        let ordered = groups.keys.sorted { a, b in
            let ta = groups[a]?.first?["at"] as? Double ?? 0
            let tb = groups[b]?.first?["at"] as? Double ?? 0
            return ta > tb
        }

        for key in ordered.prefix(visibleGroups) {
            guard let items = groups[key] else { continue }

            let head = GroupRow(
                name: key,
                running: items.contains { ($0["running"] as? Bool) ?? false },
                expanded: !collapsed.contains(key)
            )
            head.frame = CGRect(x: 6, y: y, width: width - 12, height: 28)
            head.onToggle = { [weak self] in
                guard let self else { return }
                if self.collapsed.contains(key) { self.collapsed.remove(key) } else { self.collapsed.insert(key) }
                self.rebuildRows()
            }
            listContainer.addSubview(head)
            y += 28

            guard !collapsed.contains(key) else { continue }

            for session in items {
                let id = session["id"] as? String ?? ""
                let running = session["running"] as? Bool ?? false
                let title = (session["title"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                    ?? String(id.prefix(18))
                let at = session["at"] as? Double ?? 0

                let row = SessionRow(title: title, time: relative(at), running: running)
                row.frame = CGRect(x: 14, y: y, width: width - 20, height: 28)
                row.onSelect = { [weak self] in self?.showDetail(id: id) }
                listContainer.addSubview(row)
                y += 28
            }
            // 组间留一点气口
            y += 4
        }

        listContainer.frame = CGRect(x: 0, y: 0, width: width, height: max(y + 8, scroll.contentSize.height))
    }

    /// 滑到接近底部就再放一页进来；没有更多就什么都不做。
    @objc private func onScroll() {
        guard scroll.documentView === listContainer else { return }
        let offset = scroll.contentView.bounds
        let contentHeight = listContainer.frame.height
        guard contentHeight > offset.height else { return }
        guard offset.maxY >= contentHeight - 24 else { return }
        guard visibleGroups < Set(sessions.map { ($0["cwd"] as? String) ?? "" }).count else { return }

        let keep = offset.origin
        visibleGroups += pageSize
        rebuildRows()
        scroll.contentView.scroll(to: keep)
    }

    // MARK: 详情

    private var pendingNonce: String?

    private func showDetail(id: String) {
        // 先显示"加载中"，再向 host 要这一条的正文
        let nonce = UUID().uuidString
        pendingNonce = nonce
        let title = sessions.first { ($0["id"] as? String) == id }?["title"] as? String ?? ""
        let placeholder = NSMutableAttributedString()
        placeholder.append(NSAttributedString(
            string: "← 返回\n",
            attributes: [.font: Self.dimFont, .foregroundColor: Self.accent,
                         .link: URL(string: "dshfloat://back")!]
        ))
        placeholder.append(NSAttributedString(
            string: "\n\(title.isEmpty ? id : title)\n\n加载中…",
            attributes: [.font: Self.bodyFont, .foregroundColor: Self.dim]
        ))
        detailView.textStorage?.setAttributedString(placeholder)
        scroll.documentView = detailView
        detailView.frame = CGRect(origin: .zero, size: scroll.contentSize)

        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".dsh/dshfloat-request.json")
        let payload: [String: Any] = ["id": id, "nonce": nonce, "at": Date().timeIntervalSince1970]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            try? data.write(to: url, options: .atomic)
        }
    }

    /// 悬停 tick 顺便检查请求是否已经回来
    func pollReply() {
        guard let nonce = pendingNonce else { return }
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".dsh/dshfloat-reply.json")
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (obj["nonce"] as? String) == nonce else { return }
        pendingNonce = nil
        showLoadedDetail(title: obj["title"] as? String ?? "",
                         assistant: obj["assistant"] as? String ?? "",
                         user: obj["user"] as? String ?? "")
    }

    private func showLoadedDetail(title: String, assistant: String, user: String) {
        let out = NSMutableAttributedString()
        out.append(NSAttributedString(
            string: "← 返回\n",
            attributes: [.font: Self.dimFont, .foregroundColor: Self.accent,
                         .link: URL(string: "dshfloat://back")!]
        ))
        out.append(NSAttributedString(
            string: "\n\(title)\n\n",
            attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                         .foregroundColor: Self.strong]
        ))
        if !user.isEmpty {
            out.append(NSAttributedString(
                string: "你：\(user)\n\n",
                attributes: [.font: Self.dimFont, .foregroundColor: Self.dim]
            ))
        }
        if !assistant.isEmpty {
            out.append(NSAttributedString(
                string: assistant,
                attributes: [.font: Self.bodyFont, .foregroundColor: Self.strong]
            ))
        }
        detailView.textStorage?.setAttributedString(out)
        detailView.frame = CGRect(origin: .zero, size: scroll.contentSize)
    }

    private func relative(_ ms: Double) -> String {
        let seconds = Date().timeIntervalSince1970 - ms / 1000
        if seconds < 60 { return "刚刚" }
        if seconds < 3600 { return "\(Int(seconds / 60))分钟" }
        if seconds < 86400 { return "\(Int(seconds / 3600))小时" }
        return "\(Int(seconds / 86400))天"
    }

    private func detailText(for session: [String: Any]) -> NSAttributedString {
        let out = NSMutableAttributedString()
        out.append(NSAttributedString(
            string: "← 返回\n",
            attributes: [.font: Self.dimFont, .foregroundColor: Self.accent,
                         .link: URL(string: "dshfloat://back")!]
        ))
        let title = (session["title"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? String((session["id"] as? String ?? "").prefix(18))
        out.append(NSAttributedString(
            string: "\n\(title)\n\n",
            attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                         .foregroundColor: Self.strong]
        ))

        // 原始文本，不做 markdown；还没有回复就留空
        let reply = (session["lastAssistant"] as? String) ?? ""
        guard !reply.isEmpty else { return out }
        out.append(NSAttributedString(
            string: reply,
            attributes: [.font: Self.bodyFont, .foregroundColor: Self.strong]
        ))
        out.append(NSAttributedString(string: "\n"))
        return out
    }

    /// 最小 markdown：**粗体**、`行内代码`、去掉行首 # 和 >。
    private func format(_ raw: String, font: NSFont, color: NSColor) -> NSAttributedString {
        var lines: [String] = []
        for line in raw.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n") {
            var t = line
            while t.hasPrefix("#") { t.removeFirst() }
            if t.hasPrefix("> ") { t = String(t.dropFirst(2)) }
            if t.hasPrefix("- ") || t.hasPrefix("* ") { t = "· " + String(t.dropFirst(2)) }
            lines.append(t)
        }
        let text = lines.joined(separator: "\n").replacingOccurrences(of: "## ", with: "")

        let out = NSMutableAttributedString()
        var bold = false
        var code = false
        var buffer = ""

        func flush() {
            guard !buffer.isEmpty else { return }
            var attrs: [NSAttributedString.Key: Any] = [.foregroundColor: color]
            if code {
                attrs[.font] = NSFont.monospacedSystemFont(ofSize: font.pointSize - 0.5, weight: .regular)
                attrs[.foregroundColor] = NSColor(white: 1.0, alpha: 0.86)
            } else if bold {
                attrs[.font] = NSFont.systemFont(ofSize: font.pointSize, weight: .semibold)
            } else {
                attrs[.font] = font
            }
            out.append(NSAttributedString(string: buffer, attributes: attrs))
            buffer = ""
        }

        var i = text.startIndex
        while i < text.endIndex {
            if text[i] == "*", text.index(after: i) < text.endIndex, text[text.index(after: i)] == "*" {
                flush(); bold.toggle(); i = text.index(i, offsetBy: 2); continue
            }
            if text[i] == "`" { flush(); code.toggle(); i = text.index(after: i); continue }
            buffer.append(text[i])
            i = text.index(after: i)
        }
        flush()
        return out
    }

    func textView(_ textView: NSTextView, clickedOnLink link: Any, at charIndex: Int) -> Bool {
        guard let url = (link as? URL) ?? (link as? String).flatMap(URL.init(string:)) else { return false }
        if url.host == "back" { showList(); return true }
        return false
    }
}

/// 让子视图从顶部开始排（AppKit 默认从底部）
final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}


// MARK: - 悬停：移上去自动展开，移开一会儿自动收回

final class HoverController {
    var whaleFrame: () -> NSRect = { .zero }
    var panelFrame: () -> NSRect? = { nil }
    var isOpen: () -> Bool = { false }
    var onOpen: () -> Void = {}
    var onClose: () -> Void = {}
    var onPanelPoint: ((NSPoint) -> Void)?
    var onPanelExit: (() -> Void)?

    private var monitors: [Any] = []
    private var openTask: DispatchWorkItem?
    private var closeTask: DispatchWorkItem?
    private var suppressUntil = Date.distantPast

    private let openDelay: TimeInterval = 0.15
    private let closeDelay: TimeInterval = 0.15

    private var timer: Timer?

    func start() {
        // 直接轮询鼠标位置：不依赖全局事件监听，也就不用任何权限
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.evaluate(NSEvent.mouseLocation)
        }
    }

    /// 拖拽、双击开合后短时间内不要被悬停逻辑覆盖
    func suppress(for seconds: TimeInterval) {
        suppressUntil = Date().addingTimeInterval(seconds)
        openTask?.cancel()
        closeTask?.cancel()
    }

    private func evaluate(_ point: NSPoint) {
        guard Date() >= suppressUntil else { return }

        let whale = whaleFrame().insetBy(dx: -4, dy: -4)
        let panel = panelFrame()

        if whale.contains(point) {
            closeTask?.cancel(); closeTask = nil
            guard !isOpen(), openTask == nil else { return }
            let task = DispatchWorkItem { [weak self] in
                self?.openTask = nil
                self?.onOpen()
            }
            openTask = task
            DispatchQueue.main.asyncAfter(deadline: .now() + openDelay, execute: task)
            return
        }

        openTask?.cancel(); openTask = nil

        if let panel, panel.insetBy(dx: -6, dy: -6).contains(point) {
            closeTask?.cancel(); closeTask = nil
            onPanelPoint?(point)
            return
        }
        onPanelExit?()

        guard isOpen(), closeTask == nil else { return }
        let task = DispatchWorkItem { [weak self] in
            self?.closeTask = nil
            self?.onClose()
        }
        closeTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + closeDelay, execute: task)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var view: GlowView!
    private var meter: TokenMeter?
    private var bridge: BridgeMeter?
    private var panel: PanelController?
    private let hover = HoverController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let screen = NSScreen.screens.first ?? NSScreen.main!
        let visible = screen.visibleFrame

        let frame = CGRect(
            x: visible.midX - collapsedSide / 2,
            y: visible.maxY - collapsedSide - 48,
            width: collapsedSide,
            height: collapsedSide
        )

        window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        // 比面板高一级：展开后鲸鱼必须骑在面板顶边上，不依赖窗口顺序
        window.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        window.ignoresMouseEvents = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        view = GlowView(frame: CGRect(origin: .zero, size: frame.size))
        window.contentView = view
        window.contentView?.wantsLayer = true
        window.contentView?.layer?.contentsScale = window.backingScaleFactor

        window.setFrame(frame, display: true)
        window.orderFrontRegardless()

        // token 仍走磁盘（当日累计只有日志里有）
        let meter = TokenMeter()
        meter.onTokens = { [weak view] total in view?.setTokens(total) }
        meter.start()
        self.meter = meter

        // 展开面板
        let panel = PanelController()
        self.panel = panel
        view.onDragMoved = { [weak panel, weak self] in
            guard let self else { return }
            self.hover.suppress(for: 0.6)
            guard let panel, let window = self.window, panel.visible else { return }
            panel.follow(window.frame)
        }
        view.onTogglePanel = { [weak self] in self?.togglePanel() }
        view.onDoubleClick = {
            guard let app = NSRunningApplication
                .runningApplications(withBundleIdentifier: "com.deepseek.dsh").first else { return }
            app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        }

        // running / 未读走桥
        let bridge = BridgeMeter()
        bridge.onRunning = { [weak view] count in view?.setRunning(count) }
        bridge.onUnread = { [weak view] count in view?.setUnread(count) }
        bridge.onSessions = { [weak panel] list in panel?.update(list) }
        view.onAcknowledge = { [weak bridge] in bridge?.acknowledge() }
        panel.bridge = bridge
        bridge.start()
        self.bridge = bridge

        // 悬停展开 / 移开收回
        hover.whaleFrame = { [weak self] in self?.window.frame ?? .zero }
        hover.panelFrame = { [weak panel] in panel?.visible == true ? panel?.frame : nil }
        hover.isOpen = { [weak panel] in panel?.visible ?? false }
        hover.onOpen = { [weak self] in self?.togglePanel() }
        hover.onPanelPoint = { [weak panel] point in panel?.pointerMoved(to: point) }
        hover.onPanelExit = { [weak panel] in panel?.pointerExited() }
        hover.onClose = { [weak self] in
            guard let self, self.panel?.visible == true else { return }
            self.togglePanel()
        }
        hover.start()

        // 开发用：build/panel.flag 存在时启动就把面板打开，方便截图
        let panelFlag = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("panel.flag")
        if FileManager.default.fileExists(atPath: panelFlag.path) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak panel, weak self] in
                guard let panel, let window = self?.window else { return }
                panel.toggle(near: window.frame)
            }
        }


        dumpFrame("launch", window: window, screen: screen)

        // 开发用：`open ... --args --expanded` 直接以展开态起来，方便截图验证
        let flag = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("expand.flag")
        let wantExpanded = FileManager.default.fileExists(atPath: flag.path)
            || CommandLine.arguments.contains("--expanded")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            if !wantExpanded {
                self.window.setFrame(frame, display: true)
            }
            self.dumpFrame("settled", window: self.window, screen: screen)
        }
        if wantExpanded {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
                self?.view.toggleExpanded()
            }
        }
    }

    /// 唯一的开合入口：双击、悬停都走这里
    private func togglePanel() {
        guard let panel, let window else { return }
        let opening = !panel.visible
        panel.toggle(near: window.frame)
        view.setLifted(opening)
        view.setBadgeSuppressed(opening)
        if opening { window.orderFrontRegardless() }
        hover.suppress(for: 0.45)
    }

    private func dumpFrame(_ tag: String, window: NSWindow, screen: NSScreen) {
        let f = window.frame
        let payload = """
        {"tag": "\(tag)", "x": \(f.origin.x), "y": \(f.origin.y), "w": \(f.width), "h": \(f.height), "screenH": \(screen.frame.height), "args": "\(CommandLine.arguments.dropFirst().joined(separator: ","))", "flag": \(FileManager.default.fileExists(atPath: Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("expand.flag").path))}
        """
        let url = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("float-frame.json")
        try? payload.write(to: url, atomically: true, encoding: .utf8)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
