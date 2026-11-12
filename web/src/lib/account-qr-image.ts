import { accountQrPayload } from "./account-qr";

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob)
    : reject(new Error("Không thể tạo ảnh QR.")), "image/png"));
}

export async function accountQrImages(accountNumber: string, owner: string, markSvg: string): Promise<{ qr: Blob; card: Blob }> {
  const { QRCodeWriter, BarcodeFormat, EncodeHintType } = await import("@zxing/library");
  const hints = new Map<import("@zxing/library").EncodeHintType, unknown>([
    [EncodeHintType.MARGIN, 4], [EncodeHintType.ERROR_CORRECTION, "H"],
  ]);
  const matrix = new QRCodeWriter().encode(accountQrPayload(accountNumber), BarcodeFormat.QR_CODE,
    0, 0, hints);
  // Reuse the rendered bank mark; the SVG contains only local vector shapes.
  const mark = new Image();
  mark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg)}`;
  await mark.decode();
  const canvas = document.createElement("canvas");
  const scale = 10;
  canvas.width = matrix.getWidth() * scale;
  canvas.height = matrix.getHeight() * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không hỗ trợ tạo ảnh QR.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < matrix.getWidth(); x++) {
      if (matrix.get(x, y)) context.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  // A small module-aligned white patch keeps the logo clear; the quiet zone stays intact.
  const patch = 7 * scale;
  const start = (canvas.width - patch) / 2;
  context.fillStyle = "white";
  context.fillRect(start, start, patch, patch);
  const markHeight = patch - 2 * scale;
  const markWidth = markHeight * 55 / 65;
  context.drawImage(mark, (canvas.width - markWidth) / 2, (canvas.height - markHeight) / 2, markWidth, markHeight);

  // Export the complete receiving card, independently of viewport size or dialog scroll.
  const card = document.createElement("canvas");
  const cardContext = card.getContext("2d");
  if (!cardContext) throw new Error("Trình duyệt không hỗ trợ tạo ảnh nhận tiền.");
  const width = 560, padding = 32;
  cardContext.font = "700 18px Arial, sans-serif";
  const ownerLines: string[] = [];
  let line = "";
  for (const character of Array.from(owner)) {
    if (line && cardContext.measureText(line + character).width > width - 2 * padding) {
      const space = line.lastIndexOf(" ");
      ownerLines.push(space > 0 ? line.slice(0, space) : line);
      line = space > 0 ? line.slice(space + 1) : "";
    }
    line += character;
  }
  ownerLines.push(line);
  const ownerY = 180;
  const accountY = ownerY + ownerLines.length * 26 + 6;
  const qrY = accountY + 38;
  const qrSize = matrix.getWidth() * Math.floor(340 / matrix.getWidth());
  const frame = qrSize + 20;
  const frameX = (width - frame) / 2;
  const footerY = qrY + frame + 24;
  const height = footerY + 52;
  card.width = width * 2;
  card.height = height * 2;
  cardContext.scale(2, 2);
  cardContext.textBaseline = "top";
  cardContext.fillStyle = "white";
  cardContext.fillRect(0, 0, width, height);
  const text = (value: string, x: number, y: number, size: number, color: string, bold = false) => {
    cardContext.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
    cardContext.fillStyle = color;
    cardContext.fillText(value, x, y);
  };
  text("QR nhận tiền", padding, 28, 22, "#0a1764", true);
  text("Nhận tiền trong D4 Bank.", padding, 60, 13, "#61769c");
  const logoHeight = 54, logoWidth = logoHeight * 55 / 65;
  cardContext.font = "400 10px Arial, sans-serif";
  const tagline = "Data for a brighter tomorrow";
  const wordWidth = cardContext.measureText(tagline).width;
  const logoX = (width - logoWidth - 12 - wordWidth) / 2;
  cardContext.drawImage(mark, logoX, 104, logoWidth, logoHeight);
  text("D4 ", logoX + logoWidth + 12, 104, 28, "#0648f5", true);
  const d4Width = cardContext.measureText("D4 ").width;
  text("Bank", logoX + logoWidth + 12 + d4Width, 104, 28, "#ff0024", true);
  text(tagline, logoX + logoWidth + 12, 140, 10, "#1041d6");
  cardContext.textAlign = "center";
  ownerLines.forEach((value, index) => text(value, width / 2, ownerY + index * 26, 18, "#0a1764", true));
  text(accountNumber, width / 2, accountY, 16, "#61769c");
  cardContext.strokeStyle = "#e4eaf4";
  cardContext.lineWidth = 1;
  cardContext.beginPath();
  cardContext.roundRect(frameX, qrY, frame, frame, 12);
  cardContext.stroke();
  cardContext.imageSmoothingEnabled = false;
  cardContext.drawImage(canvas, frameX + 10, qrY + 10, qrSize, qrSize);
  text("Quét mã bằng D4 Bank để chuyển tiền.", width / 2, footerY, 13, "#61769c");
  const [qr, receivingCard] = await Promise.all([png(canvas), png(card)]);
  return { qr, card: receivingCard };
}
