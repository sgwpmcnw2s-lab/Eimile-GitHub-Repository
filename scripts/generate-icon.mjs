import fs from "node:fs";
import zlib from "node:zlib";

const size = 128;
const bytes = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  bytes[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const offset = row + 1 + x * 4;
    const dx = x - 63.5;
    const dy = y - 63.5;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const outer = distance < 47;
    const ring = distance > 35 && distance < 42;
    const center = distance < 8;
    const axis = outer && ((Math.abs(dx) < 3 && Math.abs(dy) > 20) || (Math.abs(dy) < 3 && Math.abs(dx) > 20));
    let color = [239, 248, 255, 255];
    if (outer) color = [217, 238, 255, 255];
    if (ring || axis) color = [59, 143, 243, 255];
    if (center) color = [35, 111, 207, 255];
    bytes.set(color, offset);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const png = Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(bytes)), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(new URL("../icons/icon.png", import.meta.url), png);
