import type { TransactionOutcome } from "./transaction-outcome";

interface ReceiptImage {
  operation: string;
  outcome: TransactionOutcome;
  title: string;
  message: string;
  label: string;
  amount?: string;
  reason?: string;
  fields: ReadonlyArray<readonly [string, string]>;
}

/** Draw only the presented values, so hidden balances and account data stay hidden. */
export async function transactionReceiptPng(receipt: ReceiptImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo ảnh trên trình duyệt này.");
  const width = 900, scale = 2, left = 64, right = width - left;
  const contentWidth = right - left;
  const font = (size: number, bold = false) => {
    context.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
  };
  const wrap = (value: string, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const combined = line ? `${line} ${word}` : word;
        if (context.measureText(combined).width <= maxWidth) {
          line = combined;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (line && context.measureText(line + character).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  // Measure before allocating the final canvas; no clipping to the viewport or modal.
  font(18);
  const operation = wrap(receipt.operation, contentWidth);
  font(30, true);
  const title = wrap(receipt.title, contentWidth - 48);
  font(18);
  const message = wrap(receipt.message, contentWidth - 48);
  font(38, true);
  const amount = receipt.amount ? wrap(receipt.amount, contentWidth - 48) : [];
  font(16, true);
  const label = wrap(receipt.label, contentWidth - 48);
  font(18);
  const reason = receipt.reason ? wrap(receipt.reason, contentWidth - 32) : [];
  const rows = receipt.fields.map(([key, value]) => {
    font(17);
    const keys = wrap(key, 220);
    font(18, true);
    const values = wrap(value || "Chưa cập nhật", contentWidth - 256);
    return { keys, values, height: Math.max(keys.length, values.length) * 26 + 28 };
  });
  const headingY = 132 + operation.length * 26;
  const headingHeight = 48 + title.length * 38 + 14 + message.length * 26
    + (amount.length ? 22 + amount.length * 46 : 0) + 20 + label.length * 24;
  const reasonHeight = reason.length ? reason.length * 26 + 32 : 0;
  const rowsY = headingY + headingHeight + 24 + (reasonHeight ? reasonHeight + 20 : 0);
  const rowsHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const height = rowsY + rowsHeight + 112;
  canvas.width = width * scale;
  canvas.height = height * scale;
  context.scale(scale, scale);
  context.textBaseline = "top";
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 16) => {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    context.fillStyle = color;
    context.fill();
  };
  const text = (lines: string[], x: number, y: number, lineHeight: number, color: string, align: CanvasTextAlign = "left") => {
    context.fillStyle = color;
    context.textAlign = align;
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    context.textAlign = "left";
  };
  const color = receipt.outcome === "success" ? "#008a64"
    : receipt.outcome === "pending" ? "#a36300"
      : receipt.outcome === "unknown" ? "#596d8d" : "#d61d43";
  const background = receipt.outcome === "success" ? "#eafaf3"
    : receipt.outcome === "pending" ? "#fff8e7"
      : receipt.outcome === "unknown" ? "#f1f5fa" : "#fff0f3";
  context.fillStyle = "#f3f6fb";
  context.fillRect(0, 0, width, height);
  box(24, 24, width - 48, height - 48, "#ffffff", 24);
  font(32, true);
  text(["D4"], left, 56, 38, "#004cff");
  text(["Bank"], left + context.measureText("D4 ").width, 56, 38, "#ff0038");
  font(13, true);
  text(["BIÊN NHẬN GIAO DỊCH"], right, 68, 18, "#647696", "right");
  font(18);
  text(operation, left, 108, 26, "#647696");
  box(left, headingY, contentWidth, headingHeight, background);
  let y = headingY + 24;
  font(30, true);
  text(title, left + 24, y, 38, "#0a1764");
  y += title.length * 38 + 14;
  font(18);
  text(message, left + 24, y, 26, "#536988");
  y += message.length * 26;
  if (amount.length) {
    y += 22;
    font(38, true);
    text(amount, left + 24, y, 46, "#0a1764");
    y += amount.length * 46;
  }
  font(16, true);
  text(label, left + 24, y + 20, 24, color);
  if (reason.length) {
    box(left, headingY + headingHeight + 24, contentWidth, reasonHeight, background, 10);
    font(18);
    text(reason, left + 16, headingY + headingHeight + 40, 26, color);
  }
  y = rowsY;
  for (const row of rows) {
    font(17);
    text(row.keys, left, y + 14, 26, "#647696");
    font(18, true);
    text(row.values, right, y + 14, 26, "#0a1764", "right");
    y += row.height;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.strokeStyle = "#e5ebf5";
    context.lineWidth = 1;
    context.stroke();
  }
  font(14);
  text(["Biên nhận thể hiện trạng thái giao dịch tại thời điểm tải."], width / 2, y + 32, 22, "#71819b", "center");
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Không thể xuất ảnh giao dịch.")), "image/png");
  });
}
