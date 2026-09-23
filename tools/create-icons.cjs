// Dependency-free rasterization of Tempo's simple clock mark for Android install icons.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); payload.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
}
function lineDistance(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const px = (x + (sx + .5) / 3) / size * 512; const py = (y + (sy + .5) / 3) / size * 512;
      if (Math.abs(Math.hypot(px - 256, py - 256) - 135) < 11.5 || lineDistance(px, py, 256, 171, 256, 259) < 11.5 || lineDistance(px, py, 256, 259, 313, 296) < 11.5) coverage++;
    }
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    [23, 106, 85].forEach((channel, index) => { pixels[offset + index] = Math.round(channel + (255 - channel) * coverage / 9); });
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path.join(__dirname, '..', `icon-${size}.png`), png);
}
