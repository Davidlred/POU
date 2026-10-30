// Builds a one-glyph font per weight: Hanken Grotesk's own N with two bars (the ₦ sign it lacks).
// Output: packages/shared/assets/fonts/P360Naira_<weight>.otf, loaded in shared/src/fonts.js and used by withNaira() in ui.js.
// usage (from the repo root):
//   npm i --no-save opentype.js@1.3.4 polygon-clipping@0.15.7
//   node scripts/make-naira-font.js node_modules/@expo-google-fonts/hanken-grotesk packages/shared/assets/fonts
const o = require('opentype.js');
const pc = require('polygon-clipping');
const fs = require('fs');
const [src, out] = process.argv.slice(2);
const W = { '400Regular': 400, '500Medium': 500, '600SemiBold': 600, '700Bold': 700, '800ExtraBold': 800 };
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p.x * q.y - q.x * p.y); }, 0);
for (const [name, w] of Object.entries(W)) {
  const f = o.loadSync(`${src}/${name}/HankenGrotesk_${name}.ttf`);
  const N = f.charToGlyph('N'); const nb = N.path.getBoundingBox();
  // bar thickness and spacing from this weight's "=" sign
  const eq = []; let cur = [];
  for (const c of f.charToGlyph('=').path.commands) { if (c.type === 'Z') { eq.push(cur); cur = []; } else cur.push(c); }
  const ys = eq.map((c) => { const y = c.map((p) => p.y); return [Math.min(...y), Math.max(...y)]; });
  const thick = Math.round((ys[0][1] - ys[0][0]) * 0.82);
  const dist = Math.abs((ys[0][0] + ys[0][1]) / 2 - (ys[1][0] + ys[1][1]) / 2);
  const mid = nb.y2 / 2, over = 55;
  // N (straight lines only) shifted right by the overhang, merged with the two bars into one outline
  const nRing = N.path.commands.filter((c) => c.x !== undefined).map((c) => [c.x + over, c.y]);
  nRing.push(nRing[0]);
  const x1 = nb.x1, x2 = nb.x2 + 2 * over;
  const bars = [mid - dist / 2, mid + dist / 2].map((cy) => {
    const y1 = Math.round(cy - thick / 2), y2 = y1 + thick;
    return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]];
  });
  const merged = pc.union([nRing], ...bars);
  const path = new o.Path();
  for (const poly of merged) poly.forEach((ring, i) => {
    let r = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
    if ((area(r) > 0) !== (i === 0)) r = r.reverse();   // outer rings counter-clockwise, holes clockwise
    path.moveTo(r[0].x, r[0].y); r.slice(1).forEach((p) => path.lineTo(p.x, p.y)); path.close();
  });
  const naira = new o.Glyph({ name: 'naira', unicode: 0x20a6, advanceWidth: N.advanceWidth + 2 * over, path });
  const notdef = new o.Glyph({ name: '.notdef', advanceWidth: 500, path: new o.Path() });
  const font = new o.Font({ familyName: 'P360Naira', styleName: name.replace(/^\d+/, ''), unitsPerEm: f.unitsPerEm, ascender: f.ascender, descender: f.descender, glyphs: [notdef, naira] });
  const file = `${out}/P360Naira_${w}.otf`;
  fs.writeFileSync(file, Buffer.from(font.toArrayBuffer()));
  console.log(file.split('/').pop(), 'rings', merged.map((p) => p.length).join('+'));
}
