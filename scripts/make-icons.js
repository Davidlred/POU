// Generates the app icons from the Poultry360 egg mark (the same shape as the splash screen).
// No image tools needed: draws with signed-distance shapes and writes PNGs with Node's zlib.
//   node scripts/make-icons.js
// Outputs, per app, into apps/<app>/assets/:
//   icon.png           1024×1024, full square with background (launcher icon, iOS, legacy Android)
//   adaptive-icon.png  1024×1024, transparent, mark inside Android's safe zone (the background colour is set in app.config.js)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Splash proportions: an egg (capsule) 104 wide × 128 tall, with a 38-wide yolk sitting 8 below centre.
function draw({ bg, egg, yolk, eggHeight }) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const k = eggHeight / 128;
  const hw = (104 * k) / 2, hh = (128 * k) / 2, r = hw, yolkR = (38 * k) / 2, yolkDy = 8 * k;
  const cx = SIZE / 2, cy = SIZE / 2;
  const cover = (d) => Math.max(0, Math.min(1, 0.5 - d));   // 1px anti-aliased edge
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
      const qx = Math.max(dx - hw + r, 0), qy = Math.max(dy - hh + r, 0);
      const aEgg = cover(Math.hypot(qx, qy) + Math.min(Math.max(dx - hw + r, dy - hh + r), 0) - r);
      const aYolk = cover(Math.hypot(x + 0.5 - cx, y + 0.5 - (cy + yolkDy)) - yolkR);
      let c = bg ? [...bg] : [0, 0, 0], a = bg ? 1 : 0;
      const over = (col, al) => { if (al <= 0) return; const na = al + a * (1 - al); c = c.map((v, i) => (col[i] * al + v * a * (1 - al)) / na); a = na; };
      over(egg, aEgg);
      over(yolk, aYolk);
      const o = (y * SIZE + x) * 4;
      px[o] = Math.round(c[0]); px[o + 1] = Math.round(c[1]); px[o + 2] = Math.round(c[2]); px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

function png(px) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);   // filter byte 0 per row
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const APPS = {
  customer: { bg: '#F2B33D', egg: '#17120E', yolk: '#F2B33D' },   // Sunrise: dark egg on yolk
  rider: { bg: '#17120E', egg: '#E9904A', yolk: '#F7C48A' },      // Ember: ember egg on dark
};
for (const [app, col] of Object.entries(APPS)) {
  const dir = path.join(__dirname, '..', 'apps', app, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const c = { egg: hex(col.egg), yolk: hex(col.yolk) };
  fs.writeFileSync(path.join(dir, 'icon.png'), png(draw({ ...c, bg: hex(col.bg), eggHeight: 560 })));
  // Android crops adaptive icons to a circle/squircle: keep the mark within the central 66%.
  fs.writeFileSync(path.join(dir, 'adaptive-icon.png'), png(draw({ ...c, bg: null, eggHeight: 430 })));
  console.log(app + ': icon.png, adaptive-icon.png');
}
