import AppKit
import ImageIO
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceDir = root.appendingPathComponent("app-store-promos/scene/iphone-6.9/backgrounds")
let output = root.appendingPathComponent("app-store-promos/scene/iphone-6.9")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let canvas = CGSize(width: 1320, height: 2868)

let navy = NSColor(calibratedRed: 0.04, green: 0.09, blue: 0.16, alpha: 1)
let ink = NSColor(calibratedRed: 0.04, green: 0.12, blue: 0.20, alpha: 1)
let blue = NSColor(calibratedRed: 0.07, green: 0.43, blue: 0.88, alpha: 1)
let sky = NSColor(calibratedRed: 0.22, green: 0.70, blue: 1.00, alpha: 1)
let yellow = NSColor(calibratedRed: 1.00, green: 0.81, blue: 0.02, alpha: 1)
let orange = NSColor(calibratedRed: 1.00, green: 0.43, blue: 0.02, alpha: 1)
let cream = NSColor(calibratedRed: 1.00, green: 0.98, blue: 0.88, alpha: 1)
let muted = NSColor(calibratedRed: 0.47, green: 0.55, blue: 0.60, alpha: 1)

let displayFont = "DINCondensed-Bold"
let headlineFont = "AvenirNextCondensed-Heavy"
let heavyFont = "AvenirNext-Heavy"
let demiFont = "AvenirNext-DemiBold"

func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
  CGRect(x: x, y: y, width: w, height: h)
}

func rounded(_ r: CGRect, _ radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
}

func fill(_ color: NSColor, _ r: CGRect) {
  color.setFill()
  NSBezierPath(rect: r).fill()
}

func fillRounded(_ color: NSColor, _ r: CGRect, _ radius: CGFloat) {
  color.setFill()
  rounded(r, radius).fill()
}

func strokeRounded(_ color: NSColor, _ r: CGRect, _ radius: CGFloat, _ width: CGFloat) {
  let path = rounded(r, radius)
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
  let resolved = NSFont(name: font, size: size) ?? NSFont.systemFont(ofSize: size, weight: .heavy)
  let attrs: [NSAttributedString.Key: Any] = [
    .font: resolved,
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
  minSize: CGFloat = 28,
  lineHeightScale: CGFloat = 0.9
) {
  var size = maxSize
  while size > minSize {
    let resolved = NSFont(name: font, size: size) ?? NSFont.systemFont(ofSize: size, weight: .heavy)
    let attrs: [NSAttributedString.Key: Any] = [.font: resolved]
    if NSString(string: text).size(withAttributes: attrs).width <= box.width {
      break
    }
    size -= 2
  }
  drawText(text, in: box, size: size, font: font, color: color, align: align, lineHeight: size * lineHeightScale)
}

func coverRect(for image: NSImage) -> CGRect {
  let imageRatio = image.size.width / image.size.height
  let canvasRatio = canvas.width / canvas.height
  if imageRatio > canvasRatio {
    let height = canvas.height
    let width = height * imageRatio
    return rect((canvas.width - width) / 2, 0, width, height)
  }
  let width = canvas.width
  let height = width / imageRatio
  return rect(0, (canvas.height - height) / 2, width, height)
}

func drawCover(_ image: NSImage) {
  image.draw(in: coverRect(for: image), from: .zero, operation: .sourceOver, fraction: 1)
}

func drawTopBand() {
  fill(orange, rect(0, canvas.height - 36, canvas.width, 36))
  fill(yellow, rect(0, canvas.height - 54, canvas.width, 14))
}

func drawBottomBand(_ text: String, color: NSColor = orange) {
  fill(color, rect(0, 0, canvas.width, 176))
  drawText(text, in: rect(76, 56, canvas.width - 152, 58), size: 42, font: heavyFont, color: .white, align: .center, lineHeight: 46)
}

func drawBrandBadge(x: CGFloat, y: CGFloat, light: Bool = false) {
  let badge = rect(x, y, 342, 94)
  fillRounded(light ? NSColor.white.withAlphaComponent(0.92) : navy.withAlphaComponent(0.92), badge, 47)
  drawText("Co-Pack", in: rect(x + 36, y + 22, 270, 52), size: 43, font: heavyFont, color: light ? navy : .white, align: .center, lineHeight: 46)
}

func drawStatStrip(_ stats: [(String, String, NSColor)], y: CGFloat) {
  let strip = rect(80, y, 1160, 250)
  fillRounded(NSColor.white.withAlphaComponent(0.86), strip, 34)
  strokeRounded(blue.withAlphaComponent(0.30), strip, 34, 3)
  for (index, stat) in stats.enumerated() {
    let cellX = 104 + CGFloat(index) * 384
    drawText(stat.0, in: rect(cellX, y + 96, 336, 92), size: 74, font: displayFont, color: stat.2, align: .center, lineHeight: 78)
    drawText(stat.1, in: rect(cellX, y + 50, 336, 34), size: 25, font: heavyFont, color: muted, align: .center, lineHeight: 28, kern: 1)
    if index < stats.count - 1 {
      fill(blue.withAlphaComponent(0.22), rect(cellX + 360, y + 46, 2, 154))
    }
  }
}

func drawWorkflowCard(y: CGFloat, number: String, title: String, copy: String, color: NSColor) {
  let card = rect(74, y, 1172, 355)
  fillRounded(NSColor.white.withAlphaComponent(0.86), card, 34)
  strokeRounded(color, card, 34, 7)
  fill(color, rect(74, y, 14, 355))
  drawText(number, in: rect(1110, y + 258, 82, 50), size: 42, font: heavyFont, color: color, align: .right, lineHeight: 44)
  drawText(title, in: rect(126, y + 171, 670, 92), size: 82, font: displayFont, color: color, align: .left, lineHeight: 84)
  drawText(copy, in: rect(126, y + 94, 760, 78), size: 33, font: demiFont, color: muted, align: .left, lineHeight: 40)
}

func withCanvas(_ body: () -> Void) -> NSBitmapImageRep {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(canvas.width),
    pixelsHigh: Int(canvas.height),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    fatalError("Could not allocate output bitmap")
  }
  rep.size = canvas
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

func save(_ rep: NSBitmapImageRep, _ name: String) {
  let url = output.appendingPathComponent(name)
  guard
    let source = rep.cgImage,
    let context = CGContext(
      data: nil,
      width: Int(canvas.width),
      height: Int(canvas.height),
      bitsPerComponent: 8,
      bytesPerRow: Int(canvas.width) * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    )
  else {
    fatalError("Could not create flattened image for \(name)")
  }
  context.setFillColor(NSColor.white.cgColor)
  context.fill(rect(0, 0, canvas.width, canvas.height))
  context.draw(source, in: rect(0, 0, canvas.width, canvas.height))
  guard
    let flattened = context.makeImage(),
    let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)
  else {
    fatalError("Could not encode \(name)")
  }
  CGImageDestinationAddImage(destination, flattened, nil)
  guard CGImageDestinationFinalize(destination) else {
    fatalError("Could not write \(name)")
  }
  print("Wrote \(url.path)")
}

func load(_ name: String) -> NSImage {
  guard let image = NSImage(contentsOf: sourceDir.appendingPathComponent(name)) else {
    fatalError("Missing background \(name)")
  }
  return image
}

func promoFloor() -> NSBitmapImageRep {
  let bg = load("factory-floor.png")
  return withCanvas {
    drawCover(bg)
    NSGradient(colors: [
      NSColor.white.withAlphaComponent(0.15),
      NSColor.white.withAlphaComponent(0.82),
      NSColor.white.withAlphaComponent(0.18)
    ])!.draw(in: rect(0, 0, canvas.width, canvas.height), angle: 90)
    fill(navy.withAlphaComponent(0.24), rect(0, 0, canvas.width, 730))
    drawTopBand()
    drawBrandBadge(x: 76, y: 2608, light: true)

    drawFittedText("RUN THE", in: rect(70, 2068, 1180, 240), maxSize: 260, font: displayFont, color: blue, align: .center)
    drawFittedText("FLOOR", in: rect(70, 1840, 1180, 295), maxSize: 320, font: displayFont, color: orange, align: .center)
    drawText("Staff stations. Start shifts. Ship contracts.", in: rect(98, 1780, 1124, 64), size: 39, font: heavyFont, color: ink.withAlphaComponent(0.70), align: .center, lineHeight: 42)

    drawStatStrip([
      ("247", "ORDERS", orange),
      ("94%", "EFFICIENCY", blue),
      ("#1", "RANKED", yellow)
    ], y: 1448)

    drawFittedText("PACKAGING LINES IN MOTION", in: rect(64, 846, 1192, 168), maxSize: 132, font: displayFont, color: yellow, align: .center)
    drawText("A bright idle sim about the people, pace, and pressure behind every contract.", in: rect(126, 735, 1068, 96), size: 33, font: demiFont, color: ink.withAlphaComponent(0.78), align: .center, lineHeight: 40)
    drawBottomBand("AVAILABLE ON THE APP STORE")
  }
}

func promoWorkflow() -> NSBitmapImageRep {
  let bg = load("orders-office.png")
  return withCanvas {
    drawCover(bg)
    NSGradient(colors: [
      cream.withAlphaComponent(0.42),
      NSColor.white.withAlphaComponent(0.78),
      NSColor.white.withAlphaComponent(0.24)
    ])!.draw(in: rect(0, 0, canvas.width, canvas.height), angle: 90)
    fill(navy.withAlphaComponent(0.86), rect(0, 2166, canvas.width, 702))
    drawTopBand()
    drawBrandBadge(x: 76, y: 2676)
    drawFittedText("MASTER THE", in: rect(60, 2440, 1200, 210), maxSize: 205, font: displayFont, color: .white, align: .center)
    drawFittedText("WORKFLOW", in: rect(52, 2220, 1216, 260), maxSize: 270, font: displayFont, color: orange, align: .center)
    fill(blue, rect(94, 2194, 1132, 5))

    drawWorkflowCard(y: 1576, number: "01", title: "PACK", copy: "Stack orders, assign workers, and load the line.", color: orange)
    drawWorkflowCard(y: 1108, number: "02", title: "INSPECT", copy: "Hit quality targets before defects ship.", color: yellow)
    drawWorkflowCard(y: 640, number: "03", title: "SHIP", copy: "Beat deadlines and push output to the limit.", color: blue)

    drawBottomBand("HOW FAR CAN YOU GO?", color: blue)
  }
}

func promoCrew() -> NSBitmapImageRep {
  let bg = load("crew-room.png")
  return withCanvas {
    drawCover(bg)
    NSGradient(colors: [
      NSColor.white.withAlphaComponent(0.12),
      NSColor.white.withAlphaComponent(0.82),
      NSColor.white.withAlphaComponent(0.30)
    ])!.draw(in: rect(0, 0, canvas.width, canvas.height), angle: 90)
    fill(navy.withAlphaComponent(0.82), rect(0, 1710, canvas.width, 1158))
    drawTopBand()
    drawBrandBadge(x: 76, y: 2608)

    drawText("BUILT FOR THE", in: rect(0, 2562, canvas.width, 74), size: 58, font: heavyFont, color: NSColor.white.withAlphaComponent(0.72), align: .center, lineHeight: 62)
    drawFittedText("LIGHT INDUSTRIAL", in: rect(28, 2246, 1264, 270), maxSize: 260, font: displayFont, color: orange, align: .center)
    drawFittedText("WORKFORCE", in: rect(74, 2090, 1172, 170), maxSize: 162, font: displayFont, color: .white, align: .center)
    fill(yellow, rect(88, 2056, 1144, 8))
    fill(orange, rect(88, 2070, 1144, 6))

    drawFittedText("GAME.", in: rect(62, 1560, 1196, 300), maxSize: 285, font: displayFont, color: blue, align: .center)
    drawFittedText("TRAIN.", in: rect(62, 1284, 1196, 300), maxSize: 285, font: displayFont, color: yellow, align: .center)
    drawFittedText("WIN.", in: rect(62, 1012, 1196, 300), maxSize: 300, font: displayFont, color: orange, align: .center)
    drawText("Hire the right people. Build the right skills. Keep the line alive.", in: rect(106, 904, 1108, 88), size: 34, font: heavyFont, color: ink.withAlphaComponent(0.72), align: .center, lineHeight: 40)

    let chips = [("SKILL", "BUILDING", yellow), ("TEAM", "TRAINING", blue), ("LEADERSHIP", "SCORING", orange)]
    for (index, chip) in chips.enumerated() {
      let x = CGFloat(78 + index * 405)
      let card = rect(x, 325, 352, 154)
      fillRounded(NSColor.white.withAlphaComponent(0.86), card, 22)
      fill(chip.2, rect(x, 472, 352, 8))
      drawText(chip.0, in: rect(x + 18, 398, 316, 40), size: 34, font: heavyFont, color: ink, align: .center, lineHeight: 36)
      drawText(chip.1, in: rect(x + 18, 354, 316, 34), size: 25, font: heavyFont, color: muted, align: .center, lineHeight: 28)
    }
    drawBottomBand("CO-PACK FOR IPHONE")
  }
}

save(promoFloor(), "01-run-the-floor-scene.png")
save(promoWorkflow(), "02-master-the-workflow-scene.png")
save(promoCrew(), "03-game-train-win-scene.png")
