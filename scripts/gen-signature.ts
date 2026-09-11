import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Génère un PNG (encodeur minimal sans dépendance) représentant une signature
// (traits cursifs noirs sur fond blanc), puis l'écrit dans public/uploads/signatures.
// Visible dans les PDF des dossiers de test (le seed utilisaient un 1x1 transparent).

const W = 400;
const H = 140;

const px = new Uint8Array(W * H * 4); // RGBA, fond blanc
function setPx(x: number, y: number) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (Math.floor(y) * W + Math.floor(x)) * 4;
  px[i] = 20; // R
  px[i + 1] = 20; // G
  px[i + 2] = 25; // B
  px[i + 3] = 255; // A
}
for (let i = 0; i < px.length; i += 4) {
  px[i] = 255;
  px[i + 1] = 255;
  px[i + 2] = 255;
  px[i + 3] = 255;
}

// Traits : paramètre t 0..1, x = 20 + t*360, y = variation curviligne
function stroke(amp: number, freq: number, phases: number[], baseY: number, width: number) {
  for (let x = 20; x < W - 20; x++) {
    const t = (x - 20) / (W - 40);
    let y = baseY;
    phases.forEach((p, i) => {
      y += (amp / (i + 1)) * Math.sin(freq * t * Math.PI * 2 + p);
    });
    for (let wy = -width; wy <= width; wy++) {
      for (let wx = -1; wx <= 1; wx++) setPx(x + wx, y + wy);
    }
  }
}

stroke(34, 1.1, [0, 1.9, 4.2], 70, 2); // grand S
stroke(24, 1.7, [1.1, 3.3], 85, 2); // second niveau
stroke(16, 2.4, [0.5, 2.2], 98, 1); // trait bas
// paraphe final
for (let i = 0; i < 40; i++) {
  const x = 320 + i * 1.6;
  const y = 60 + Math.sin(i * 0.55) * 14 - i * 0.4;
  for (let wx = -2; wx <= 2; wx++) {
    for (let wy = -2; wy <= 2; wy++) setPx(x + wx, y + wy);
  }
}
// Barre finale
setPx(360, 40); setPx(362, 42); setPx(364, 45); setPx(366, 48); setPx(368, 52); setPx(370, 56);

// Encodage PNG
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.concat([typeBuf, data]);
  // CRC32
  let crc = 0xffffffff;
  for (const b of crcBuf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBytes]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// raw scanlines with filter byte 0
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4;
    const dst = y * (1 + W * 4) + 1 + x * 4;
    raw[dst] = px[src];
    raw[dst + 1] = px[src + 1];
    raw[dst + 2] = px[src + 2];
    raw[dst + 3] = px[src + 3];
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(process.cwd(), "public", "uploads", "signatures");
mkdirSync(out, { recursive: true });
const file = path.join(out, "signature-test.png");
writeFileSync(file, png);
console.log("Signature PNG écrite:", file, `(${png.length} octets, ${W}x${H})`);