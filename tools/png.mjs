// Minimal PNG decoder (8-bit RGBA/RGB, non-interlaced) using zlib.
import {inflateSync} from 'node:zlib';
export const PNG = { decode(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p+4, p+8); const d = buf.subarray(p+8, p+8+len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w*bpp, out = Buffer.alloc(w*h*4); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y*(stride+1)], line = Buffer.from(raw.subarray(y*(stride+1)+1, y*(stride+1)+1+stride));
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? line[i-bpp] : 0, b = prev[i], c = i >= bpp ? prev[i-bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a+b) >> 1; else if (f === 4) { const pp = a+b-c, pa = Math.abs(pp-a), pb = Math.abs(pp-b), pc = Math.abs(pp-c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255; }
    for (let x = 0; x < w; x++) { const o = (y*w+x)*4, s = x*bpp; out[o] = line[s]; out[o+1] = line[s+1]; out[o+2] = line[s+2]; out[o+3] = bpp === 4 ? line[s+3] : 255; }
    prev = line; }
  return {width: w, height: h, data: out}; } };
