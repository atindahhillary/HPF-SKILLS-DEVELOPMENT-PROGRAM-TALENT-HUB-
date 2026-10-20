// Passport-style crops: same 7:9 frame, face centred and the same size in every photo.
// Usage: node tools/passport.cjs <folder-of-original-photos>   (files named <trainee-id>.jpg)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false); // On Windows a cached handle can lock files we overwrite.

const SRC = process.argv[2];
if (!SRC) { console.error('Usage: node tools/passport.cjs <folder-of-originals>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'assets/photos');
const W = 560, H = 720;            // 7:9, like a 35 x 45 mm passport photo
const FACE = 0.42;                 // hairline-to-chin as a share of frame height
const FACE_Y = 0.47;               // face centre, from the top of the frame

// Face centre (cx, cy) and hairline-to-chin height (fh), as fractions of the original image.
// Measured by hand on a 10% grid. Update when a photo is replaced.
const FACES = {
  'beatrice-simaloi-ketere': { cx: 0.47, cy: 0.355, fh: 0.27 },
  // Supplied as a white circle on grey; fillCorners paints outside the circle white.
  'doris-koros': { cx: 0.53, cy: 0.37, fh: 0.30, fillCorners: true },
  'george-tipango': { cx: 0.50, cy: 0.37, fh: 0.26 },
  'gloria-kisianan': { cx: 0.47, cy: 0.44, fh: 0.31 },
  'gloria-tago': { cx: 0.45, cy: 0.19, fh: 0.17 },
  'jane-eloto': { cx: 0.50, cy: 0.41, fh: 0.34 },
  'john-sanare-muli': { cx: 0.48, cy: 0.365, fh: 0.37 },
  'maxwell-liaram': { cx: 0.60, cy: 0.40, fh: 0.30 },
  'saiton-nampaso': { cx: 0.45, cy: 0.47, fh: 0.43 },
  'sanau-sengeny': { cx: 0.47, cy: 0.305, fh: 0.13 },
  // Busy foliage behind her doubles the file size at the default quality.
  'seema-letoluo': { cx: 0.50, cy: 0.26, fh: 0.32, quality: 68 },
  'seenoi-naurori': { cx: 0.44, cy: 0.34, fh: 0.28 },
  'sharon-koina': { cx: 0.47, cy: 0.285, fh: 0.17 },
  'stacy-sakat': { cx: 0.46, cy: 0.29, fh: 0.22 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

(async () => {
  for (const [id, f] of Object.entries(FACES)) {
    const file = path.join(SRC, id + '.jpg');
    if (!fs.existsSync(file)) { console.log('missing', id); continue; }
    const { width: iw, height: ih } = await sharp(file).metadata();
    // Crop height from face size, capped so the 7:9 frame still fits inside the image.
    let ch = (f.fh * ih) / FACE;
    ch = Math.min(ch, ih, (iw * 9) / 7);
    const cw = (ch * 7) / 9;
    const left = clamp(f.cx * iw - cw / 2, 0, iw - cw);
    const top = clamp(f.cy * ih - FACE_Y * ch, 0, ih - ch);
    let src = file;
    if (f.fillCorners) {
      const r = Math.min(iw, ih) / 2 - 2;
      const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}"><path fill="#fff" fill-rule="evenodd" d="M0 0H${iw}V${ih}H0Z M${iw / 2 - r} ${ih / 2}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z"/></svg>`;
      src = await sharp(file).composite([{ input: Buffer.from(mask) }]).png().toBuffer();
    }
    const out = await sharp(src)
      .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(cw), height: Math.round(ch) })
      .resize(W, H, { kernel: 'lanczos3' })
      .sharpen({ sigma: ch < H ? 0.8 : 0.4 })
      .webp({ quality: f.quality || 82 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT, id + '.webp'), out);
    console.log(id.padEnd(26), `crop ${Math.round(cw)}x${Math.round(ch)}`, ch < H ? '(upscaled)' : '');
  }
})();
