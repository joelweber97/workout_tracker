/*
 * Generates the app icons as PNGs, with no image library.
 *
 * There is no toolchain on this machine — no ImageMagick, no working Python,
 * Node 10 and nothing else — so this writes the PNG bytes directly. Node's
 * zlib is the only thing needed beyond arithmetic: a PNG is a signature, an
 * IHDR chunk, deflate-compressed scanlines in IDAT, and IEND.
 *
 * Run: node tools/make-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'web', 'icons');
const ACCENT = [0xd6, 0x33, 0x4c];
const INK = [0xff, 0xff, 0xff];

// --- PNG plumbing ------------------------------------------------------------

const CRC_TABLE = (function build() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** `pixels` is RGB, 3 bytes per pixel, row-major. */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with its filter type; 0 means "none".
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing -----------------------------------------------------------------

/**
 * Coverage of a rounded rectangle at a point, sampled 3x3 for anti-aliasing.
 * Coordinates are fractions of the icon's size.
 */
function roundedRectCoverage(px, py, unit, x0, y0, x1, y1, radius) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const x = (px + (sx + 0.5) / 3) / unit;
      const y = (py + (sy + 0.5) / 3) / unit;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;

      // Inside the straight edges, or within the radius of the nearest corner.
      const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) hits += 1;
    }
  }
  return hits / 9;
}

/** A dumbbell: centre bar, a plate each side, and an outer collar. */
const GLYPH = [
  [0.30, 0.470, 0.70, 0.530, 0.02],  // bar
  [0.20, 0.360, 0.31, 0.640, 0.035], // left plate
  [0.69, 0.360, 0.80, 0.640, 0.035], // right plate
  [0.11, 0.418, 0.20, 0.582, 0.03],  // left collar
  [0.80, 0.418, 0.89, 0.582, 0.03],  // right collar
];

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (let i = 0; i < GLYPH.length; i += 1) {
        const g = GLYPH[i];
        coverage = Math.max(coverage, roundedRectCoverage(x, y, size, g[0], g[1], g[2], g[3], g[4]));
        if (coverage >= 1) break;
      }

      const offset = (y * size + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        pixels[offset + c] = Math.round(ACCENT[c] + (INK[c] - ACCENT[c]) * coverage);
      }
    }
  }

  return encodePng(size, pixels);
}

// --- Main --------------------------------------------------------------------

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

[180, 192, 512].forEach(function write(size) {
  const file = path.join(OUT_DIR, 'icon-' + size + '.png');
  fs.writeFileSync(file, renderIcon(size));
  console.log('wrote ' + file + ' (' + fs.statSync(file).size + ' bytes)');
});
