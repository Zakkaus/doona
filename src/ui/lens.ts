// Liquid Glass lensing for the Glass palette, after kube.io's approach: light passing a convex glass edge (refractive
// index 1.5, a squircle bezel) shifts what lies behind it, by Snell's law. The shift is precomputed once per corner
// radius into a displacement map, and an SVG filter that backdrop-filter references applies it. A map is nine slices
// held by an SVG image without a fixed size: the corners keep their pixels and the edges stretch, so one map fits a
// surface of any size and nothing is rebuilt per element or on resize. A second image, from the same surface normals
// and one light from the top left, adds the specular rim. Only Chromium applies an SVG filter in backdrop-filter;
// Safari parses it and ignores it, so the check below asks for Chromium's own API as well as the CSS syntax.

type Lens = {id: string; radius: number; bezel: number; scale: number};

// One filter per radius class. `scale` is twice the largest shift in pixels, as feDisplacementMap reads it.
const lenses: Lens[] = [
  {id: 'doona-lens', radius: 20, bezel: 28, scale: 90},
  {id: 'doona-lens-sm', radius: 10, bezel: 16, scale: 44}
];
const INDEX = 1.5;
const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2];

export function lensSupported(): boolean {
  // userAgentData exists only in secure contexts, and doona is often served over plain HTTP, so the engine check falls
  // back to Chromium's user agent token, which Safari, Firefox and the WebKit browsers on iOS do not carry.
  const brands = (navigator as Navigator & {userAgentData?: {brands: Array<{brand: string}>}}).userAgentData?.brands;
  const chromium = brands ? brands.some(({brand}) => brand === 'Chromium') : /Chrom(e|ium)\/\d/.test(navigator.userAgent);
  return chromium && CSS.supports('backdrop-filter', 'url(#a)');
}

// The shift towards the inside at `d` pixels in from the edge, from 0 to 1: the surface rises as a squircle over the
// bezel, its slope tilts the normal, and the refracted ray drifts sideways through the glass under it.
function profile(bezel: number): (d: number) => number {
  const height = (x: number) => Math.pow(1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 4), 0.25);
  const shift = (d: number) => {
    if (d >= bezel) return 0;
    const x = d / bezel;
    const slope = (height(x + 0.001) - height(Math.max(x - 0.001, 0))) / (x + 0.001 - Math.max(x - 0.001, 0));
    const tilt = Math.atan(slope);
    const bend = tilt - Math.asin(Math.sin(tilt) / INDEX);
    return Math.tan(bend) * (0.5 + height(x));
  };
  let peak = 0;
  for (let d = 0; d < bezel; d += 0.25) peak = Math.max(peak, shift(d));
  return d => shift(d) / peak;
}

// Distance in from the edge and the outward normal at a pixel of the top-left corner tile.
function corner(x: number, y: number, radius: number): [number, number, number] {
  if (x < radius && y < radius) {
    const vx = x - radius;
    const vy = y - radius;
    const length = Math.hypot(vx, vy) || 1;
    return [Math.max(radius - length, 0), vx / length, vy / length];
  }
  if (x < radius) return [x, -1, 0];
  if (y < radius) return [y, 0, -1];
  return x < y ? [x, -1, 0] : [y, 0, -1];
}

// A tile of `width` by `height` pixels, mirrored into place: `fx`/`fy` flip a top-left geometry to the other sides.
function tile(width: number, height: number, sample: (x: number, y: number) => [number, number, number], shift: (d: number) => number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const map = context.createImageData(width, height);
  const spec = context.createImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [d, nx, ny] = sample(x + 0.5, y + 0.5);
      const m = shift(d);
      const i = (y * width + x) * 4;
      map.data.set([128 - 127 * m * nx, 128 - 127 * m * ny, 128, 255], i);
      // The rim: brightest where the edge faces the light, fainter where light leaves on the far side, fading in 3px.
      const facing = nx * LIGHT[0] + ny * LIGHT[1];
      const glow = Math.pow(Math.max(facing, 0), 2) + 0.4 * Math.pow(Math.max(-facing, 0), 2);
      const fade = Math.max(1 - d / 3, 0) ** 2;
      spec.data.set([255, 255, 255, Math.round(255 * Math.min(glow * fade, 1))], i);
    }
  const encode = (data: ImageData) => {
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  };
  return [encode(map), encode(spec)];
}

// The nine slices as one SVG image: a neutral middle, four stretched edges and four corners of `size` pixels.
function slices({radius, bezel}: Lens): [string, string] {
  const size = Math.max(radius, bezel) + 1;
  const shift = profile(bezel);
  const flip = (fx: boolean, fy: boolean) => (x: number, y: number) => {
    const [d, nx, ny] = corner(fx ? size - x : x, fy ? size - y : y, radius);
    return [d, fx ? -nx : nx, fy ? -ny : ny] as [number, number, number];
  };
  const parts = [
    // Edges: [x, y, width, height, sample]
    ['0', '0', '100%', `${size}`, tile(1, size, (_, y) => [y, 0, -1], shift)],
    ['0', '100%', '100%', `${size}`, tile(1, size, (_, y) => [size - y, 0, 1], shift), `0 -${size}`],
    ['0', '0', `${size}`, '100%', tile(size, 1, x => [x, -1, 0], shift)],
    ['100%', '0', `${size}`, '100%', tile(size, 1, x => [size - x, 1, 0], shift), `-${size} 0`],
    ['0', '0', `${size}`, `${size}`, tile(size, size, flip(false, false), shift)],
    ['100%', '0', `${size}`, `${size}`, tile(size, size, flip(true, false), shift), `-${size} 0`],
    ['0', '100%', `${size}`, `${size}`, tile(size, size, flip(false, true), shift), `0 -${size}`],
    ['100%', '100%', `${size}`, `${size}`, tile(size, size, flip(true, true), shift), `-${size} -${size}`]
  ] as Array<[string, string, string, string, string[], string?]>;
  const image = (layer: number, fill: string) =>
    `data:image/svg+xml;base64,${btoa(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${fill}"/>${parts
        .map(
          ([x, y, width, height, images, move]) =>
            `<image href="${images[layer]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"${move ? ` transform="translate(${move})"` : ''}/>`
        )
        .join('')}</svg>`
    )}`;
  // SVG's named gray is 128 in every channel: no shift.
  return [image(0, 'gray'), image(1, 'none')];
}

// Builds the filters once and marks the root so the stylesheet can use them.
let installed = false;
export function installLens(): boolean {
  if (installed) return true;
  if (!lensSupported()) return false;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = lenses
    .map(lens => {
      const [map, spec] = slices(lens);
      return `<filter id="${lens.id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${map}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${lens.scale}" xChannelSelector="R" yChannelSelector="G" result="bent"/><feImage href="${spec}" preserveAspectRatio="none" result="rim"/><feComposite in="rim" in2="bent" operator="over"/></filter>`;
    })
    .join('');
  document.body.append(svg);
  installed = true;
  return true;
}
