import {DUCK_BOX, DUCK_PATHS} from './loginDuck';

// The showcase beside the sign-in form: an "under construction" scene that a press turns into Flappy Duck, flying
// through the gaps in firewall walls while the forwarded traffic adds up. Difficulty rises without end but only
// approaches limits the flap physics can still clear. Paused while hidden or off screen; a still idle scene under
// reduced motion.

// Logical units, drawn at ZOOM css px each. DUCK_HEIGHT and IDLE_HEIGHT are the duck's height in flight and standing;
// the physics runs in fixed STEP seconds. FLAP_HEIGHT is the height one flap gains, so a gap of DUCK_HEIGHT +
// FLAP_HEIGHT can always be held; SPEED_MAX leaves one whole flap between walls at the tightest spacing.
const ZOOM = 1.4;
export const DUCK_HEIGHT = 52;
const IDLE_HEIGHT = 64;
const STEP = 1 / 120;
const GRAVITY = 1500;
const FLAP = 430;
const WALL = 48;
export const FLAP_HEIGHT = (FLAP * FLAP) / (2 * GRAVITY);
export const GAP_MIN = Math.max(2.2 * DUCK_HEIGHT, DUCK_HEIGHT + FLAP_HEIGHT + 4);
export const SPACE_MIN = 200;
export const SPEED_MAX = (SPACE_MIN * GRAVITY) / (2 * FLAP);
// Half the duck's hit box: its drawn bounds, pulled in to 84% so a brush with a wall's corner is forgiven.
const HALF_W = (0.84 * DUCK_HEIGHT * DUCK_BOX.width) / DUCK_BOX.height / 2;
const HALF_H = (0.84 * DUCK_HEIGHT) / 2;

function unit(n: number, units: string[], digits: number) {
  let i = 0;
  for (; n >= 1000 && i < units.length - 1; i++) n /= 1000;
  return (i ? n.toFixed(digits) : n.toFixed(digits > 1 ? 1 : 0)) + ' ' + units[i];
}
// What the run forwarded, from its total in MB.
export function amountText(mb: number) {
  return unit(mb, ['MB', 'GB', 'TB', 'PB'], 2);
}
// The link rate in Mbps: named steps up to 650 Mbps, then 1, 1.5, 2.5, 4, 6 times each power of ten, without end.
export function rate(stage: number) {
  return stage < 6 ? [100, 150, 200, 300, 450, 650][stage] : [1, 1.5, 2.5, 4, 6][(stage - 6) % 5] * Math.pow(10, 3 + Math.floor((stage - 6) / 5));
}
export function rateText(stage: number) {
  const n = rate(stage);
  return n < 1000 ? n + ' Mbps' : unit(n, ['Mbps', 'Gbps', 'Tbps', 'Pbps'], 1).replace('.0 ', ' ');
}
// Each stage is harder than the last but only approaches the limits: speed SPEED_MAX, gap GAP_MIN, spacing SPACE_MIN.
// From the Gbps stages on, gaps also swing high and low and start to drift.
export function level(stage: number) {
  const k = Math.pow(0.9, stage);
  return {
    speed: SPEED_MAX - (SPEED_MAX - 110) * k,
    gap: GAP_MIN + (205 - GAP_MIN) * k,
    space: SPACE_MIN + 70 * k,
    swing: stage < 6 ? 0 : 34 * (1 - Math.pow(0.8, stage - 5)),
    drift: stage >= 6
  };
}

export type GameText = {
  sign: string;
  start: string;
  restart: string;
  result: (amount: string) => string;
  best: (amount: string) => string;
};
export type LoginGame = {setText: (text: GameText) => void; destroy: () => void};
type Wall = {x: number; ox: number; gap: number; c0: number; c: number; oc: number; a: number; f: number; ph: number; done: boolean};
type Colors = {ink: string; paper: string; yellow: string; text: string; sub: string; accent: string; wall: string; base: string; gold: string; cone: string};

// Runs the scene and the game on the canvas inside the button until destroy. The text arrives through setText, and
// onCrash hears each result for the live region.
export function startLoginGame(button: HTMLButtonElement, canvas: HTMLCanvasElement, onCrash: (amount: string, best: string) => void): LoginGame {
  const g = canvas.getContext('2d');
  if (!g) return {setText() {}, destroy() {}};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const drawing = DUCK_PATHS.map(([fill, d]) => [fill, new Path2D(d)] as const);
  let text: GameText | undefined;
  let font = '';
  let colors: Colors = look();
  let scale = 1;
  let w = 0;
  let h = 0;
  let ground = 0;
  let duckX = 0;
  let y = 0;
  let py = 0;
  let vy = 0;
  let walls: Wall[] = [];
  let mb = 0;
  let best = 0;
  let stage = 0;
  let passed = 0;
  let flash = 0;
  let playing = false;
  let down = 0;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let now = 0;
  let seen = true;
  let timer = 0;

  function look(): Colors {
    // The panel's own style carries the palette from <html> and the duck's ink, paper and yellow, which stay the same on
    // every palette and scheme so the props drawn beside the duck match it.
    const css = getComputedStyle(button);
    const token = (name: string) => css.getPropertyValue(name).trim();
    font = css.fontFamily;
    return {
      ink: token('--rp-mark-ink'),
      paper: token('--rp-mark-paper'),
      yellow: token('--rp-mark-yellow'),
      text: token('--rp-text'),
      sub: token('--rp-subtle'),
      accent: token('--rp-accent'),
      wall: token('--rp-negative'),
      base: token('--rp-base'),
      gold: token('--rp-gold'),
      cone: token('--rp-rose')
    };
  }
  function size() {
    scale = (window.devicePixelRatio || 1) * ZOOM;
    canvas.width = Math.round((canvas.clientWidth * scale) / ZOOM);
    canvas.height = Math.round((canvas.clientHeight * scale) / ZOOM);
    w = canvas.clientWidth / ZOOM;
    h = canvas.clientHeight / ZOOM;
    ground = Math.round(h * 0.84);
    duckX = Math.round(w * 0.3);
  }
  function wall(x: number) {
    const L = level(stage);
    const lo = 40 + L.gap / 2 + L.swing;
    const hi = ground - 30 - L.gap / 2 - L.swing;
    const prev = walls[walls.length - 1];
    let c = lo + Math.random() * (hi - lo);
    if (prev) {
      // The next gap stays within reach: half the spare room in this gap plus a steady climb across the open stretch.
      const reach = (L.gap - 2 * HALF_H) / 2 + (220 * (L.space - WALL - 2 * HALF_W)) / L.speed - 2 * L.swing;
      if (L.drift && Math.random() < 0.6) c = prev.c0 < (lo + hi) / 2 ? hi : lo;
      c = Math.max(prev.c0 - reach, Math.min(prev.c0 + reach, c));
    }
    c = Math.max(lo, Math.min(hi, c));
    // A drifting gap never moves faster than the duck can follow.
    const a = L.swing * (Math.random() < 0.5 ? 1 : 0);
    walls.push({x, ox: x, gap: L.gap, c0: c, c, oc: c, a, f: a ? Math.min(3, 110 / a) : 0, ph: Math.random() * 6.3, done: false});
  }
  function reset() {
    y = py = h * 0.42;
    vy = mb = stage = passed = flash = down = acc = 0;
    walls = [];
    wall(w + 10);
  }
  function crash() {
    down = performance.now();
    best = Math.max(best, mb);
    onCrash(amountText(mb), amountText(best));
    window.clearTimeout(timer);
    timer = window.setTimeout(() => draw(), 950);
  }
  function step(t: number) {
    const L = level(stage);
    now += t;
    py = y;
    vy = Math.min(700, vy + GRAVITY * t);
    y += vy * t;
    if (y < DUCK_HEIGHT / 2) {
      y = DUCK_HEIGHT / 2;
      vy = 0;
    }
    mb += (rate(stage) / 8) * t;
    for (const p of walls) {
      p.ox = p.x;
      p.oc = p.c;
      p.x -= L.speed * t;
      if (p.a) p.c = p.c0 + p.a * Math.sin(p.f * now + p.ph);
      if (!p.done && p.x + WALL < duckX - HALF_W) {
        p.done = true;
        // The first speed-up comes after two walls, then one every three.
        if (++passed % 3 === 2) {
          stage += 1;
          flash = now;
        }
      }
      if (!down && p.x < duckX + HALF_W && p.x + WALL > duckX - HALF_W && (y - HALF_H < p.c - p.gap / 2 || y + HALF_H > p.c + p.gap / 2)) crash();
    }
    if (walls[walls.length - 1].x < w - L.space) wall(w + 10);
    walls = walls.filter(p => p.x > -WALL);
    if (!down && y + DUCK_HEIGHT / 2 - 3 > ground) {
      y = ground - DUCK_HEIGHT / 2 + 3;
      crash();
    }
  }
  function shape(fill: string, path: () => void) {
    g!.beginPath();
    path();
    g!.fillStyle = fill;
    g!.fill();
    g!.stroke();
  }
  // The duck, mirrored to face right, centred on (x, yc) and s tall.
  function duck(x: number, yc: number, s: number, rot: number) {
    const k = s / DUCK_BOX.height;
    g!.save();
    g!.translate(x, yc);
    g!.rotate(rot);
    g!.scale(-k, k);
    g!.translate(-(DUCK_BOX.x + DUCK_BOX.width / 2), -(DUCK_BOX.y + DUCK_BOX.height / 2));
    for (const [fill, path] of drawing) {
      g!.fillStyle = colors[fill];
      g!.fill(path, 'evenodd');
    }
    g!.restore();
  }
  // A width, when given, shrinks the text to fit it, so a long translation stays inside the sign.
  function say(s: string, x: number, yy: number, color: string, px?: number, width?: number) {
    g!.fillStyle = color;
    g!.font = `${px ? 600 : 500} ${px ?? 13}px ${font}`;
    g!.fillText(s, x, yy, width);
  }
  // Snaps a logical x to the device pixel grid so scrolling walls keep crisp edges.
  function snap(v: number) {
    return Math.round(v * scale) / scale;
  }
  function draw(al = 1) {
    g!.setTransform(scale, 0, 0, scale, 0, 0);
    g!.clearRect(0, 0, w, h);
    if (!text || !w) return;
    const C = colors;
    g!.lineWidth = 1.5;
    g!.strokeStyle = C.ink;
    g!.lineJoin = 'round';
    g!.textAlign = 'center';
    if (!playing) {
      // Under construction: a sign on two legs over a cone, a second cone to the right, and the duck on the left.
      const gi = Math.round(h / 2 + 64);
      const cx = Math.round(w / 2);
      g!.fillStyle = C.sub;
      g!.fillRect(cx - 213, gi, 426, 1.5);
      for (const x of [cx - 62, cx + 56]) shape(C.paper, () => g!.rect(x, gi - 76, 6, 76));
      shape(C.gold, () => g!.roundRect(cx - 96, gi - 128, 192, 52, 6));
      g!.textBaseline = 'middle';
      say(text.sign, cx, gi - 102, C.ink, 16, 168);
      g!.textBaseline = 'alphabetic';
      for (const x of [cx, cx + 139]) {
        shape(C.cone, () => {
          g!.moveTo(x - 13, gi);
          g!.lineTo(x - 3, gi - 32);
          g!.lineTo(x + 3, gi - 32);
          g!.lineTo(x + 13, gi);
          g!.closePath();
        });
        shape(C.paper, () => g!.rect(x - 8, gi - 18, 16, 5));
      }
      duck(cx - 139, gi - IDLE_HEIGHT / 2, IDLE_HEIGHT, 0);
      if (!reduce.matches) say(text.start, cx, gi + 40, C.sub);
      return;
    }
    g!.fillStyle = C.sub;
    g!.fillRect(0, ground, w, 1.5);
    for (const p of walls) {
      const x = snap(p.ox + (p.x - p.ox) * al);
      const c = p.oc + (p.c - p.oc) * al;
      const a = c - p.gap / 2;
      const b = c + p.gap / 2;
      for (const [from, to] of [
        [0, a],
        [b, ground]
      ]) {
        shape(C.wall, () => g!.rect(x, from - 2, WALL, to - from + 2));
        // Brick courses in the background colour, anchored to the gap edge so a drifting gap carries them along.
        g!.fillStyle = C.base;
        const top = !from;
        for (let i = 1, yy = (top ? a : b) + (top ? -12 : 12); yy > 1 && yy < ground - 1; i++, yy = (top ? a : b) + (top ? -12 : 12) * i) {
          g!.fillRect(x + 1, yy, WALL - 2, 1);
          g!.fillRect(x + (i % 2 ? 16 : 32), top ? yy + 1 : yy - 11, 1, 11);
        }
      }
    }
    g!.strokeStyle = C.sub;
    if (down) {
      // The result sits at the top on a plate of the background colour, away from the crash point.
      shape(C.base, () => g!.roundRect(w / 2 - 150, 16, 300, 92, 8));
      say(text.result(amountText(mb)), w / 2, 46, C.text, 16);
      say(text.best(amountText(Math.max(best, mb))), w / 2, 70, C.sub);
      if (performance.now() - down > 900) say(text.restart, w / 2, 94, C.sub);
    } else {
      // The score keeps a small plate of its own so a wall passing behind it never cuts through the digits.
      shape(C.base, () => g!.roundRect(w / 2 - 70, 18, 140, 52, 8));
      say(amountText(mb), w / 2, 40, C.text, 16);
      say(rateText(stage), w / 2, 60, now - flash < 1.2 && stage ? C.accent : C.sub);
    }
    g!.strokeStyle = C.ink;
    duck(duckX, py + (y - py) * al, DUCK_HEIGHT, Math.max(-0.35, Math.min(0.5, vy / 900)));
  }
  // Fixed steps with the leftover fraction interpolated, so the motion is even at any refresh rate.
  function frame(ts: number) {
    raf = 0;
    acc += Math.min(0.1, (ts - (last || ts)) / 1000);
    last = ts;
    while (acc >= STEP && !down) {
      step(STEP);
      acc -= STEP;
    }
    draw(down ? 1 : acc / STEP);
    run();
  }
  function run() {
    if (reduce.matches) playing = false;
    if (!playing || down || reduce.matches || document.hidden || !seen) {
      last = 0;
      draw();
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function flap(restart: boolean) {
    if (reduce.matches) return;
    if (down && !restart && performance.now() - down < 900) return;
    if (!playing || down || restart) {
      playing = true;
      reset();
    }
    vy = -FLAP;
    run();
  }
  // Pointer and Space act on press. The pointer press takes focus itself without the keyboard focus ring, so no
  // selection or outline follows and the first press still flaps; click covers Enter and assistive technology.
  const onPointer = (event: PointerEvent) => {
    if (event.button) return;
    event.preventDefault();
    button.focus({preventScroll: true, focusVisible: false} as FocusOptions);
    flap(false);
  };
  // A shortcut with a modifier, such as reload, is left to the browser.
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' || event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      if (!event.repeat) flap(event.key !== ' ');
    }
  };
  const onClick = (event: MouseEvent) => {
    if (event.detail === 0) flap(false);
  };
  const restyle = () => {
    colors = look();
    draw();
  };
  button.addEventListener('pointerdown', onPointer);
  button.addEventListener('keydown', onKey);
  button.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', run);
  reduce.addEventListener('change', run);
  const resized = new ResizeObserver(() => {
    size();
    run();
  });
  resized.observe(canvas);
  const shown = new IntersectionObserver(entries => {
    seen = entries[entries.length - 1].isIntersecting;
    run();
  });
  shown.observe(canvas);
  // The palette and scheme live on <html>, and the toggle beside the form flips them while the scene stays.
  const themed = new MutationObserver(restyle);
  themed.observe(root, {attributes: true, attributeFilter: ['data-scheme', 'data-family', 'data-flavour']});
  size();
  reset();
  run();

  return {
    setText(next) {
      text = next;
      restyle();
      // Canvas text doesn't fetch the web font's unicode-range subsets the page hasn't shown yet, so these strings would
      // draw in a fallback font; load the subsets they need and draw again.
      const glyphs = [next.sign, next.start, next.restart, next.result(amountText(0)), next.best(amountText(0))].join('');
      Promise.all([500, 600].map(weight => document.fonts.load(`${weight} 16px ${font}`, glyphs))).then(
        () => {
          if (text === next) draw();
        },
        () => {}
      );
    },
    destroy() {
      text = undefined;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      button.removeEventListener('pointerdown', onPointer);
      button.removeEventListener('keydown', onKey);
      button.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', run);
      reduce.removeEventListener('change', run);
      resized.disconnect();
      shown.disconnect();
      themed.disconnect();
    }
  };
}
