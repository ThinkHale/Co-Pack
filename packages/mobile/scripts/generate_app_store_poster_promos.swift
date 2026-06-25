import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let output = root.appendingPathComponent("app-store-promos/poster-bright/iphone-6.9")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let canvasSize = CGSize(width: 1320, height: 2868)

let navy = NSColor(calibratedRed: 0.04, green: 0.07, blue: 0.13, alpha: 1)
let ink = NSColor(calibratedRed: 0.05, green: 0.11, blue: 0.18, alpha: 1)
let sky = NSColor(calibratedRed: 0.18, green: 0.70, blue: 1.00, alpha: 1)
let blue = NSColor(calibratedRed: 0.08, green: 0.42, blue: 0.86, alpha: 1)
let lightBlue = NSColor(calibratedRed: 0.64, green: 0.88, blue: 1.00, alpha: 1)
let yellow = NSColor(calibratedRed: 1.00, green: 0.82, blue: 0.03, alpha: 1)
let orange = NSColor(calibratedRed: 1.00, green: 0.43, blue: 0.02, alpha: 1)
let gold = NSColor(calibratedRed: 0.93, green: 0.62, blue: 0.16, alpha: 1)
let cream = NSColor(calibratedRed: 0.94, green: 0.98, blue: 1.00, alpha: 1)
let panel = NSColor(calibratedRed: 0.98, green: 0.99, blue: 1.00, alpha: 1)
let muted = NSColor(calibratedRed: 0.43, green: 0.52, blue: 0.59, alpha: 1)

let condensed = "DINCondensed-Bold"
let avenirHeavy = "AvenirNext-Heavy"
let avenirDemi = "AvenirNext-DemiBold"
let avenirCondensedHeavy = "AvenirNextCondensed-Heavy"

func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
  CGRect(x: x, y: y, width: w, height: h)
}

func pathRounded(_ r: CGRect, _ radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
}

func fill(_ color: NSColor, _ r: CGRect) {
  color.setFill()
  NSBezierPath(rect: r).fill()
}

func fillRounded(_ color: NSColor, _ r: CGRect, _ radius: CGFloat) {
  color.setFill()
  pathRounded(r, radius).fill()
}

func strokeRounded(_ color: NSColor, _ r: CGRect, _ radius: CGFloat, _ width: CGFloat) {
  let path = pathRounded(r, radius)
  path.lineWidth = width
  color.setStroke()
  path.stroke()
}

func drawText(
  _ text: String,
  in box: CGRect,
  size: CGFloat,
  font: String,
  color: NSColor,
  align: NSTextAlignment = .left,
  lineHeight: CGFloat? = nil,
  kern: CGFloat = 0
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = align
  paragraph.lineBreakMode = .byWordWrapping
  paragraph.lineSpacing = max(0, (lineHeight ?? size * 1.02) - size)
  let resolvedFont = NSFont(name: font, size: size) ?? NSFont.systemFont(ofSize: size, weight: .heavy)
  let attrs: [NSAttributedString.Key: Any] = [
    .font: resolvedFont,
    .foregroundColor: color,
    .paragraphStyle: paragraph,
    .kern: kern
  ]
  NSString(string: text).draw(with: box, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attrs)
}

func drawFittedText(
  _ text: String,
  in box: CGRect,
  maxSize: CGFloat,
  font: String,
  color: NSColor,
  align: NSTextAlignment = .left,
  minSize: CGFloat = 24,
  kern: CGFloat = 0
) {
  var size = maxSize
  while size > minSize {
    let resolvedFont = NSFont(name: font, size: size) ?? NSFont.systemFont(ofSize: size, weight: .heavy)
    let attrs: [NSAttributedString.Key: Any] = [.font: resolvedFont, .kern: kern]
    if NSString(string: text).size(withAttributes: attrs).width <= box.width {
      break
    }
    size -= 2
  }
  drawText(text, in: box, size: size, font: font, color: color, align: align, lineHeight: size * 0.9, kern: kern)
}

func drawImage(_ image: NSImage, in frame: CGRect, fraction: CGFloat = 1, radius: CGFloat = 0) {
  NSGraphicsContext.saveGraphicsState()
  if radius > 0 {
    pathRounded(frame, radius).addClip()
  }
  image.draw(in: frame, from: .zero, operation: .sourceOver, fraction: fraction)
  NSGraphicsContext.restoreGraphicsState()
}

func drawDots(color: NSColor, alpha: CGFloat = 0.24, spacing: CGFloat = 76, radius: CGFloat = 4) {
  color.withAlphaComponent(alpha).setFill()
  var y: CGFloat = 125
  while y < canvasSize.height - 100 {
    var x: CGFloat = 72
    while x < canvasSize.width - 70 {
      NSBezierPath(ovalIn: rect(x, y, radius, radius)).fill()
      x += spacing
    }
    y += spacing
  }
}

func drawHazardStripeBand(y: CGFloat, height: CGFloat, background: NSColor = yellow) {
  fill(background, rect(0, y, canvasSize.width, height))
  navy.setFill()
  let stripeWidth: CGFloat = 96
  var x: CGFloat = -220
  while x < canvasSize.width + 220 {
    let path = NSBezierPath()
    path.move(to: CGPoint(x: x, y: y))
    path.line(to: CGPoint(x: x + stripeWidth, y: y))
    path.line(to: CGPoint(x: x + stripeWidth + height, y: y + height))
    path.line(to: CGPoint(x: x + height, y: y + height))
    path.close()
    path.fill()
    x += stripeWidth * 2
  }
}

func drawConveyorGrid(y: CGFloat, height: CGFloat, color: NSColor) {
  color.withAlphaComponent(0.75).setStroke()
  for i in 0...11 {
    let t = CGFloat(i) / 11
    let yy = y + pow(t, 1.75) * height
    let path = NSBezierPath()
    path.lineWidth = 2
    path.move(to: CGPoint(x: -60, y: yy))
    path.line(to: CGPoint(x: canvasSize.width + 60, y: yy))
    path.stroke()
  }

  for i in 0...34 {
    let t = CGFloat(i) / 34
    let topX = 510 + (t - 0.5) * 90
    let bottomX = 190 + t * 940
    let path = NSBezierPath()
    path.lineWidth = 1.3
    path.move(to: CGPoint(x: topX, y: y + height))
    path.line(to: CGPoint(x: bottomX, y: y))
    path.stroke()
  }
}

func drawBoxIcon(_ r: CGRect, color: NSColor, width: CGFloat = 7) {
  let p = NSBezierPath(rect: r)
  p.lineWidth = width
  color.setStroke()
  p.stroke()
  let lid = NSBezierPath()
  lid.lineWidth = width
  lid.move(to: CGPoint(x: r.minX, y: r.maxY))
  lid.line(to: CGPoint(x: r.minX + r.width * 0.18, y: r.maxY + r.height * 0.18))
  lid.line(to: CGPoint(x: r.maxX + r.width * 0.18, y: r.maxY + r.height * 0.18))
  lid.line(to: CGPoint(x: r.maxX, y: r.maxY))
  lid.move(to: CGPoint(x: r.maxX, y: r.minY))
  lid.line(to: CGPoint(x: r.maxX + r.width * 0.18, y: r.minY + r.height * 0.18))
  lid.line(to: CGPoint(x: r.maxX + r.width * 0.18, y: r.maxY + r.height * 0.18))
  lid.move(to: CGPoint(x: r.minX, y: r.minY))
  lid.line(to: CGPoint(x: r.minX + r.width * 0.18, y: r.minY + r.height * 0.18))
  lid.line(to: CGPoint(x: r.maxX + r.width * 0.18, y: r.minY + r.height * 0.18))
  lid.move(to: CGPoint(x: r.minX, y: r.minY))
  lid.line(to: CGPoint(x: r.maxX, y: r.maxY))
  lid.move(to: CGPoint(x: r.maxX, y: r.minY))
  lid.line(to: CGPoint(x: r.minX, y: r.maxY))
  lid.stroke()
}

func drawBottle(_ x: CGFloat, _ y: CGFloat, _ scale: CGFloat, color: NSColor) {
  fillRounded(color, rect(x + 22 * scale, y + 70 * scale, 46 * scale, 128 * scale), 18 * scale)
  fillRounded(color, rect(x + 31 * scale, y + 195 * scale, 28 * scale, 54 * scale), 8 * scale)
  fillRounded(blue, rect(x + 25 * scale, y + 248 * scale, 40 * scale, 22 * scale), 7 * scale)
  fillRounded(NSColor.white.withAlphaComponent(0.38), rect(x + 34 * scale, y + 92 * scale, 12 * scale, 86 * scale), 6 * scale)
}

func drawStats(_ items: [(String, String, NSColor)], y: CGFloat) {
  let card = rect(80, y, 1160, 270)
  fillRounded(NSColor.white.withAlphaComponent(0.84), card, 28)
  strokeRounded(blue.withAlphaComponent(0.28), card, 28, 3)
  for (index, item) in items.enumerated() {
    let x = 110 + CGFloat(index) * 380
    drawText(item.0, in: rect(x, y + 110, 340, 100), size: 76, font: condensed, color: item.2, align: .center, lineHeight: 78)
    drawText(item.1, in: rect(x, y + 54, 340, 42), size: 27, font: avenirHeavy, color: muted, align: .center, lineHeight: 30, kern: 1.2)
    if index < 2 {
      fill(blue.withAlphaComponent(0.20), rect(x + 356, y + 54, 2, 170))
    }
  }
}

func drawBottomBar(_ text: String, color: NSColor = orange) {
  fill(color, rect(0, 0, canvasSize.width, 168))
  drawText(text, in: rect(90, 54, 1140, 64), size: 44, font: avenirHeavy, color: .white, align: .center, lineHeight: 48)
}

func drawSmallBrand(y: CGFloat, onDark: Bool = false) {
  let badgeColor = onDark ? NSColor.white : navy
  drawText("Co-Pack", in: rect(72, y, 330, 72), size: 54, font: avenirHeavy, color: badgeColor, align: .left, lineHeight: 58)
}

func withBitmap(_ body: () -> Void) -> NSBitmapImageRep {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(canvasSize.width),
    pixelsHigh: Int(canvasSize.height),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    fatalError("Could not allocate bitmap")
  }
  rep.size = canvasSize
  guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
    fatalError("Could not create graphics context")
  }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  body()
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func save(_ rep: NSBitmapImageRep, named filename: String) {
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode \(filename)")
  }
  let url = output.appendingPathComponent(filename)
  try! png.write(to: url)
  print("Wrote \(url.path)")
}

func posterOne() -> NSBitmapImageRep {
  withBitmap {
    NSGradient(colors: [lightBlue, cream])!.draw(in: rect(0, 0, canvasSize.width, canvasSize.height), angle: 90)
    fill(orange, rect(0, 2818, canvasSize.width, 32))
    fill(yellow, rect(0, 2794, canvasSize.width, 14))
    drawDots(color: blue, alpha: 0.13, spacing: 80, radius: 5)

    fillRounded(NSColor.white.withAlphaComponent(0.70), rect(70, 1568, 1180, 1110), 48)
    strokeRounded(blue.withAlphaComponent(0.24), rect(70, 1568, 1180, 1110), 48, 3)
    drawSmallBrand(y: 2592)

    drawFittedText("CO", in: rect(195, 2195, 930, 410), maxSize: 420, font: condensed, color: blue, align: .center)
    drawFittedText("PACK", in: rect(120, 1840, 1080, 470), maxSize: 465, font: condensed, color: orange, align: .center)
    drawText("CONTRACT PACKAGING IDLE SIMULATOR", in: rect(146, 1770, 1028, 58), size: 40, font: avenirHeavy, color: ink.withAlphaComponent(0.66), align: .center, lineHeight: 42, kern: 1.3)

    drawStats(
      [
        ("247", "ORDERS", orange),
        ("94%", "EFFICIENCY", blue),
        ("#1", "RANKED", yellow)
      ],
      y: 1458
    )

    fill(navy, rect(0, 168, canvasSize.width, 1055))
    fill(blue.withAlphaComponent(0.15), rect(0, 168, canvasSize.width, 1055))
    drawConveyorGrid(y: 168, height: 705, color: orange)
    drawFittedText("RUN THE FLOOR", in: rect(50, 1000, 1220, 246), maxSize: 250, font: condensed, color: yellow, align: .center)

    drawBottle(106, 650, 1.9, color: sky)
    drawBottle(232, 615, 1.65, color: blue)
    drawBoxIcon(rect(955, 625, 150, 150), color: yellow, width: 8)
    fillRounded(gold, rect(985, 472, 210, 135), 18)
    strokeRounded(ink.withAlphaComponent(0.35), rect(985, 472, 210, 135), 18, 4)
    drawBottomBar("AVAILABLE ON THE APP STORE")
  }
}

func workflowCard(y: CGFloat, number: String, title: String, body: String, accent: NSColor, icon: String) {
  let r = rect(54, y, 1212, 518)
  fillRounded(panel, r, 30)
  strokeRounded(accent, r, 30, 8)
  fill(accent, rect(54, y, 14, 518))
  drawText(number, in: rect(1112, y + 392, 104, 62), size: 48, font: avenirHeavy, color: accent, align: .right, lineHeight: 50)
  drawFittedText(title, in: rect(120, y + 285, 660, 130), maxSize: 118, font: condensed, color: accent, align: .left)
  drawText(body, in: rect(120, y + 146, 760, 150), size: 39, font: avenirDemi, color: muted, align: .left, lineHeight: 56)

  switch icon {
  case "box":
    drawBoxIcon(rect(1012, y + 92, 122, 122), color: accent, width: 7)
  case "glass":
    let circle = NSBezierPath(ovalIn: rect(1012, y + 106, 96, 96))
    circle.lineWidth = 8
    accent.setStroke()
    circle.stroke()
    let handle = NSBezierPath()
    handle.lineWidth = 9
    handle.move(to: CGPoint(x: 1080, y: y + 132))
    handle.line(to: CGPoint(x: 1148, y: y + 62))
    handle.stroke()
  default:
    let arrow = NSBezierPath()
    arrow.lineWidth = 9
    accent.setStroke()
    arrow.move(to: CGPoint(x: 1008, y: y + 144))
    arrow.line(to: CGPoint(x: 1138, y: y + 144))
    arrow.line(to: CGPoint(x: 1094, y: y + 184))
    arrow.move(to: CGPoint(x: 1138, y: y + 144))
    arrow.line(to: CGPoint(x: 1094, y: y + 104))
    arrow.stroke()
  }
}

func posterTwo() -> NSBitmapImageRep {
  withBitmap {
    NSGradient(colors: [cream, lightBlue])!.draw(in: rect(0, 0, canvasSize.width, canvasSize.height), angle: 90)
    fill(orange, rect(0, 2814, canvasSize.width, 54))
    drawDots(color: blue, alpha: 0.18, spacing: 74, radius: 5)
    drawFittedText("MASTER THE", in: rect(48, 2474, 1224, 250), maxSize: 230, font: condensed, color: .white, align: .center)
    drawFittedText("WORKFLOW", in: rect(42, 2248, 1236, 310), maxSize: 300, font: condensed, color: orange, align: .center)
    drawText("From order intake to shipped pallets, every shift is a puzzle.", in: rect(86, 2164, 1148, 70), size: 37, font: avenirDemi, color: ink.withAlphaComponent(0.62), align: .center, lineHeight: 42)

    fill(navy, rect(0, 2138, canvasSize.width, 730))
    drawDots(color: .white, alpha: 0.14, spacing: 68, radius: 5)
    drawFittedText("MASTER THE", in: rect(48, 2474, 1224, 250), maxSize: 230, font: condensed, color: .white, align: .center)
    drawFittedText("WORKFLOW", in: rect(42, 2248, 1236, 310), maxSize: 300, font: condensed, color: orange, align: .center)
    fill(blue.withAlphaComponent(0.7), rect(96, 2184, 1128, 4))

    workflowCard(y: 1546, number: "01", title: "PACK", body: "Stack orders, assign workers, and load the line.", accent: orange, icon: "box")
    workflowCard(y: 966, number: "02", title: "INSPECT", body: "Hit quality targets and catch defects before they ship.", accent: yellow, icon: "glass")
    workflowCard(y: 386, number: "03", title: "SHIP", body: "Beat deadlines and push output to the limit.", accent: blue, icon: "arrow")

    drawBottomBar("HOW FAR CAN YOU GO?", color: blue)
  }
}

func miniMetric(_ title: String, _ subtitle: String, _ color: NSColor, x: CGFloat) {
  let r = rect(x, 306, 348, 156)
  fillRounded(panel.withAlphaComponent(0.92), r, 22)
  fill(color, rect(x, 456, 348, 8))
  drawText(title, in: rect(x + 20, 380, 308, 44), size: 35, font: avenirHeavy, color: ink, align: .center, lineHeight: 38)
  drawText(subtitle, in: rect(x + 20, 335, 308, 36), size: 26, font: avenirHeavy, color: muted, align: .center, lineHeight: 28)
}

func posterThree() -> NSBitmapImageRep {
  withBitmap {
    fill(navy, rect(0, 0, canvasSize.width, canvasSize.height))
    drawDots(color: .white, alpha: 0.16, spacing: 70, radius: 4)
    drawHazardStripeBand(y: 2720, height: 148)
    fill(orange, rect(0, 2698, canvasSize.width, 20))
    fill(orange, rect(0, 170, canvasSize.width, 20))
    drawHazardStripeBand(y: 0, height: 148)

    drawText("BUILT FOR THE", in: rect(0, 2578, canvasSize.width, 72), size: 58, font: avenirHeavy, color: NSColor.white.withAlphaComponent(0.62), align: .center, lineHeight: 60)
    drawFittedText("LIGHT", in: rect(0, 2308, canvasSize.width, 250), maxSize: 245, font: condensed, color: orange, align: .center)
    drawFittedText("INDUSTRIAL", in: rect(26, 2124, 1268, 250), maxSize: 230, font: condensed, color: orange, align: .center)
    drawFittedText("WORKFORCE", in: rect(120, 1998, 1080, 154), maxSize: 142, font: condensed, color: .white, align: .center)

    fill(yellow, rect(82, 1952, 1156, 8))
    fill(orange, rect(82, 1964, 1156, 7))

    drawFittedText("GAME.", in: rect(48, 1518, 1224, 425), maxSize: 380, font: condensed, color: .white, align: .center)
    drawFittedText("TRAIN.", in: rect(42, 1114, 1236, 425), maxSize: 390, font: condensed, color: yellow, align: .center)
    drawFittedText("WIN.", in: rect(42, 720, 1236, 425), maxSize: 410, font: condensed, color: orange, align: .center)
    drawText("CO-PACK FOR IPHONE", in: rect(0, 655, canvasSize.width, 64), size: 43, font: avenirHeavy, color: NSColor.white.withAlphaComponent(0.62), align: .center, lineHeight: 46)

    miniMetric("SKILL", "BUILDING", yellow, x: 80)
    miniMetric("TEAM", "TRAINING", blue, x: 486)
    miniMetric("LEADERSHIP", "SCORING", .white, x: 892)
  }
}

save(posterOne(), named: "01-run-the-floor-bright.png")
save(posterTwo(), named: "02-master-the-workflow-bright.png")
save(posterThree(), named: "03-game-train-win-bright.png")
