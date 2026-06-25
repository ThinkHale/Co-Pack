import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let screenshots = root.appendingPathComponent("app-store-screenshots/iphone-6.9")
let output = root.appendingPathComponent("app-store-promos/iphone-6.9")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let canvasSize = CGSize(width: 1320, height: 2868)
let fontName = "Avenir Next"
let heavyFontName = "Avenir Next Heavy"
let demiFontName = "Avenir Next Demi Bold"

struct Promo {
  let filename: String
  let screenshot: String
  let kicker: String
  let title: String
  let subtitle: String
  let accent: NSColor
  let secondary: NSColor
  let tilt: CGFloat
  let alignRight: Bool
  let phoneY: CGFloat
}

let promos = [
  Promo(
    filename: "01-run-the-line.png",
    screenshot: "02-floor.png",
    kicker: "IDLE FACTORY SIM",
    title: "Run the line.\nWin the contract.",
    subtitle: "Staff stations, start shifts, and turn every minute into output.",
    accent: NSColor(calibratedRed: 0.20, green: 0.49, blue: 0.82, alpha: 1),
    secondary: NSColor(calibratedRed: 0.91, green: 0.73, blue: 0.22, alpha: 1),
    tilt: -4,
    alignRight: false,
    phoneY: 320
  ),
  Promo(
    filename: "02-keep-crew-moving.png",
    screenshot: "04-staffing.png",
    kicker: "WORKFORCE MATTERS",
    title: "Keep your crew\nmoving.",
    subtitle: "Hire, place, and retain the people who keep production alive.",
    accent: NSColor(calibratedRed: 0.29, green: 0.65, blue: 0.39, alpha: 1),
    secondary: NSColor(calibratedRed: 0.25, green: 0.54, blue: 0.91, alpha: 1),
    tilt: 3,
    alignRight: true,
    phoneY: 330
  ),
  Promo(
    filename: "03-pick-profitable-orders.png",
    screenshot: "03-orders.png",
    kicker: "CONTRACT STRATEGY",
    title: "Pick the orders\nthat pay.",
    subtitle: "Balance deadlines, rates, and risk before the dock fills up.",
    accent: NSColor(calibratedRed: 0.92, green: 0.58, blue: 0.12, alpha: 1),
    secondary: NSColor(calibratedRed: 0.20, green: 0.49, blue: 0.82, alpha: 1),
    tilt: -2,
    alignRight: false,
    phoneY: 330
  ),
  Promo(
    filename: "04-watch-the-numbers.png",
    screenshot: "05-office.png",
    kicker: "FRONT OFFICE",
    title: "Watch every\nnumber.",
    subtitle: "Cash, payroll, morale, and burn rate all shape the next shift.",
    accent: NSColor(calibratedRed: 0.13, green: 0.19, blue: 0.29, alpha: 1),
    secondary: NSColor(calibratedRed: 0.35, green: 0.70, blue: 0.45, alpha: 1),
    tilt: 3,
    alignRight: true,
    phoneY: 325
  ),
  Promo(
    filename: "05-scale-the-operation.png",
    screenshot: "06-upgrades.png",
    kicker: "GROW SMARTER",
    title: "Scale the\noperation.",
    subtitle: "Upgrade lines and systems to turn a small shop into a serious plant.",
    accent: NSColor(calibratedRed: 0.20, green: 0.49, blue: 0.82, alpha: 1),
    secondary: NSColor(calibratedRed: 0.89, green: 0.32, blue: 0.36, alpha: 1),
    tilt: -3,
    alignRight: false,
    phoneY: 330
  )
]

func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
  CGRect(x: x, y: y, width: w, height: h)
}

func roundedPath(_ r: CGRect, _ radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
}

func fillRounded(_ r: CGRect, radius: CGFloat, color: NSColor) {
  color.setFill()
  roundedPath(r, radius).fill()
}

func strokeRounded(_ r: CGRect, radius: CGFloat, color: NSColor, width: CGFloat) {
  let path = roundedPath(r, radius)
  path.lineWidth = width
  color.setStroke()
  path.stroke()
}

func drawText(
  _ text: String,
  in box: CGRect,
  fontSize: CGFloat,
  weight: String,
  color: NSColor,
  alignment: NSTextAlignment = .left,
  lineHeight: CGFloat? = nil
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = alignment
  paragraph.lineBreakMode = .byWordWrapping
  paragraph.lineSpacing = max(0, (lineHeight ?? fontSize * 1.06) - fontSize)

  let font = NSFont(name: weight, size: fontSize)
    ?? NSFont(name: fontName, size: fontSize)
    ?? NSFont.systemFont(ofSize: fontSize, weight: .bold)

  let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: color,
    .paragraphStyle: paragraph,
    .kern: 0
  ]
  NSString(string: text).draw(with: box, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attrs)
}

func drawImage(_ image: NSImage, in frame: CGRect, cornerRadius: CGFloat = 0) {
  NSGraphicsContext.saveGraphicsState()
  if cornerRadius > 0 {
    roundedPath(frame, cornerRadius).addClip()
  }
  image.draw(in: frame, from: .zero, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
}

func drawPhone(screenshot: NSImage, at centerX: CGFloat, y: CGFloat, width: CGFloat, tilt: CGFloat) {
  let phoneAspect: CGFloat = 2868 / 1320
  let phoneH = width * phoneAspect
  let frame = rect(centerX - width / 2, y, width, phoneH)
  let border: CGFloat = 22
  let inner = frame.insetBy(dx: border, dy: border)
  let radius: CGFloat = 78

  NSGraphicsContext.saveGraphicsState()
  let transform = NSAffineTransform()
  transform.translateX(by: frame.midX, yBy: frame.midY)
  transform.rotate(byDegrees: tilt)
  transform.translateX(by: -frame.midX, yBy: -frame.midY)
  transform.concat()

  let shadow = NSShadow()
  shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.24)
  shadow.shadowBlurRadius = 45
  shadow.shadowOffset = CGSize(width: 0, height: -20)
  shadow.set()

  fillRounded(frame, radius: radius, color: NSColor(calibratedRed: 0.07, green: 0.10, blue: 0.15, alpha: 1))
  NSShadow().set()
  strokeRounded(frame, radius: radius, color: NSColor.white.withAlphaComponent(0.55), width: 3)
  drawImage(screenshot, in: inner, cornerRadius: radius - 22)

  NSGraphicsContext.restoreGraphicsState()
}

func drawBackground(_ promo: Promo) {
  NSColor(calibratedRed: 0.91, green: 0.95, blue: 0.91, alpha: 1).setFill()
  NSBezierPath(rect: rect(0, 0, canvasSize.width, canvasSize.height)).fill()

  promo.accent.withAlphaComponent(0.13).setFill()
  NSBezierPath(ovalIn: rect(-260, 1380, 900, 900)).fill()
  promo.secondary.withAlphaComponent(0.16).setFill()
  NSBezierPath(ovalIn: rect(730, 290, 760, 760)).fill()

  fillRounded(rect(80, 2020, 1160, 650), radius: 52, color: NSColor.white.withAlphaComponent(0.72))
  strokeRounded(rect(80, 2020, 1160, 650), radius: 52, color: NSColor.white.withAlphaComponent(0.75), width: 2)

  for index in 0..<7 {
    let x = CGFloat(130 + index * 170)
    let y = CGFloat(2360 + (index % 2) * 52)
    fillRounded(rect(x, y, 110, 74), radius: 14, color: index % 3 == 0 ? promo.secondary.withAlphaComponent(0.85) : NSColor(calibratedRed: 0.89, green: 0.63, blue: 0.22, alpha: 0.76))
    strokeRounded(rect(x, y, 110, 74), radius: 14, color: NSColor.white.withAlphaComponent(0.55), width: 2)
  }

  promo.accent.withAlphaComponent(0.2).setStroke()
  let line = NSBezierPath()
  line.lineWidth = 14
  line.move(to: CGPoint(x: -40, y: 2490))
  line.curve(to: CGPoint(x: 1370, y: 2360), controlPoint1: CGPoint(x: 350, y: 2600), controlPoint2: CGPoint(x: 900, y: 2220))
  line.stroke()
}

func drawHeader(_ promo: Promo) {
  let left: CGFloat = 98
  let top: CGFloat = 2422
  let textWidth: CGFloat = 1124
  let titleAlign: NSTextAlignment = promo.alignRight ? .right : .left

  let kickerW = CGFloat(max(410, min(620, 26 * promo.kicker.count)))
  let kickerX = promo.alignRight ? canvasSize.width - left - kickerW : left
  fillRounded(rect(kickerX, top, kickerW, 70), radius: 35, color: promo.accent)
  drawText(
    promo.kicker,
    in: rect(kickerX + 30, top + 15, kickerW - 60, 50),
    fontSize: 30,
    weight: demiFontName,
    color: .white,
    alignment: .center,
    lineHeight: 34
  )

  drawText(
    promo.title,
    in: rect(left, 2100, textWidth, 300),
    fontSize: 100,
    weight: heavyFontName,
    color: NSColor(calibratedRed: 0.07, green: 0.12, blue: 0.16, alpha: 1),
    alignment: titleAlign,
    lineHeight: 104
  )

  drawText(
    promo.subtitle,
    in: rect(left + (promo.alignRight ? 170 : 0), 1952, textWidth - 170, 132),
    fontSize: 39,
    weight: demiFontName,
    color: NSColor(calibratedRed: 0.34, green: 0.43, blue: 0.46, alpha: 1),
    alignment: titleAlign,
    lineHeight: 48
  )
}

func drawLogoBadge() {
  let text = "Co-Pack"
  fillRounded(rect(86, 2576, 322, 96), radius: 48, color: NSColor(calibratedRed: 0.07, green: 0.10, blue: 0.16, alpha: 0.92))
  drawText(text, in: rect(124, 2597, 250, 60), fontSize: 43, weight: heavyFontName, color: .white, alignment: .center)
}

for promo in promos {
  guard let screenshot = NSImage(contentsOf: screenshots.appendingPathComponent(promo.screenshot)) else {
    fatalError("Missing screenshot \(promo.screenshot)")
  }

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
    fatalError("Could not allocate bitmap for \(promo.filename)")
  }
  rep.size = canvasSize

  let context = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context?.imageInterpolation = .high
  drawBackground(promo)
  drawHeader(promo)
  let centerX: CGFloat = promo.alignRight ? 464 : 856
  drawPhone(screenshot: screenshot, at: centerX, y: promo.phoneY, width: 720, tilt: promo.tilt)
  drawLogoBadge()
  NSGraphicsContext.restoreGraphicsState()

  guard let png = rep.representation(using: .png, properties: [:]) else {
    fatalError("Could not render \(promo.filename)")
  }

  try png.write(to: output.appendingPathComponent(promo.filename))
  print("Wrote \(output.appendingPathComponent(promo.filename).path)")
}
