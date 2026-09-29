import {DUCK_BOX, DUCK_PATHS} from './loginDuck';
import {formatUnit, type UnitKey} from '../i18n/format';

// The showcase beside the sign-in form: a loading bar stuck at 99% that a press turns into Flappy Duck, flying through
// the gaps in firewall walls while the forwarded traffic adds up. Difficulty rises without end but only approaches
// limits the flap physics can still clear. Paused while hidden or off screen; a still idle scene under reduced motion.

// Logical units, drawn at ZOOM css px each. DUCK_HEIGHT and IDLE_HEIGHT are the duck's height in flight and standing;
// the physics runs in fixed STEP seconds. FLAP_HEIGHT is the height one flap gains, so a gap of DUCK_HEIGHT +
// FLAP_HEIGHT can always be held; SPEED_MAX leaves one whole flap between walls at the tightest spacing.
const ZOOM = 1.4;
export const DUCK_HEIGHT = 52;
const IDLE_HEIGHT = 72;
// The dots after the loading label step every DOT_STEP ms.
const DOT_STEP = 500;
// The idle scene: a barricade, a bar up to BAR_WIDTH wide POST_SPACE to its right, the duck DUCK_SPACE past the bar,
// and the ground reaching GROUND_EDGE past them all, which keeps EDGE clear of the panel's sides. The barricade's board
// is at least BOARD_WIDTH wide and BOARD_HEIGHT tall, its striped rail RAIL_HEIGHT. ROW_GAP separates the loading label
// from the 99%.
const BAR_WIDTH = 250;
const BAR_HEIGHT = 22;
const DUCK_SPACE = 22;
// The duck's ink starts about 2 inside its box, so the barricade stands that much further off to leave equal gaps.
const POST_SPACE = DUCK_SPACE + 2;
const GROUND_EDGE = 16;
const EDGE = 12;
const BOARD_WIDTH = 56;
const BOARD_HEIGHT = 17;
const RAIL_HEIGHT = 9;
const ROW_GAP = 18;
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

// n in the largest of units (each 1000 of the one before) it reaches at least one of.
function scaled(n: number, units: readonly UnitKey[]): [number, number] {
  let i = 0;
  for (; n >= 1000 && i < units.length - 1; i++) n /= 1000;
  return [n, i];
}
// What the run forwarded, from its total in MB: one decimal in MB, two from GB up.
export function amountText(mb: number, locale: string) {
  const units = ['unit.megabyte', 'unit.gigabyte', 'unit.terabyte', 'unit.petabyte'] as const;
  const [n, i] = scaled(mb, units);
  return formatUnit(n, locale, units[i], i ? 2 : 1);
}
// The link rate in Mbps: named steps up to 650 Mbps, then 1, 1.5, 2.5, 4, 6 times each power of ten, without end.
export function rate(stage: number) {
  return stage < 6 ? [100, 150, 200, 300, 450, 650][stage] : [1, 1.5, 2.5, 4, 6][(stage - 6) % 5] * Math.pow(10, 3 + Math.floor((stage - 6) / 5));
}
// A whole rate drops the decimal: 1 Gbps, 1.5 Gbps.
export function rateText(stage: number, locale: string) {
  const units = ['unit.megabitPerSecond', 'unit.gigabitPerSecond', 'unit.terabitPerSecond', 'unit.petabitPerSecond'] as const;
  const [n, i] = scaled(rate(stage), units);
  return formatUnit(n, locale, units[i], Math.round(n * 10) % 10 ? 1 : 0);
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

// How many dots follow the loading label after the given seconds: 3, 0, 1, 2 and round again, so a still shows all three.
export function loadingDots(seconds: number) {
  return (Math.floor((seconds * 1000) / DOT_STEP) + 3) % 4;
}

// The idle scene as one group centred in a w by h panel: the barricade with its board as wide as the status needs and
// the duck standing on the same ground, the bar with the loading label and 99% above it held clear of the ground
// between them, and the start line below.
// fit carries what the text needs: the board's width, the loading row's width and the label's cap height. The bar
// gives up width first on a narrow panel, never below the row; when that is still too wide, the whole group draws
// smaller by shrink around (cx, h / 2) instead of squeezing the text. Every y is a text baseline except head, sign,
// rail, bar and ground, which are top edges.
export function idleLayout(w: number, h: number, fit: {board?: number; row?: number; cap?: number} = {}) {
  const duckWidth = (IDLE_HEIGHT * DUCK_BOX.width) / DUCK_BOX.height;
  const board = Math.max(BOARD_WIDTH, fit.board ?? 0);
  const room = Math.floor(w - 2 * (EDGE + GROUND_EDGE) - board - POST_SPACE - DUCK_SPACE - duckWidth);
  const bar = Math.max(120, fit.row ?? 0, Math.min(BAR_WIDTH, room));
  const span = board + POST_SPACE + bar + DUCK_SPACE + duckWidth;
  const shrink = Math.min(1, (w / 2 - EDGE) / (span / 2 + GROUND_EDGE));
  // Heights from the ground up, then the stack from the duck's helmet to the start line's descenders centred on h / 2.
  // The bar floats one bar height above the ground so the two never read as one stroke, its middle level with the
  // duck's body and the barricade's rail; the board's top meets the label's capitals.
  const top = -2 * BAR_HEIGHT;
  const label = top - 12;
  const head = -IDLE_HEIGHT;
  const start = 40;
  const ground = Math.round(h / 2 - (head + start + 4) / 2);
  const cx = Math.round(w / 2);
  const post = Math.round(cx - span / 2);
  const x = post + board + POST_SPACE;
  return {
    cx,
    post,
    board,
    x,
    bar,
    ground,
    top: ground + top,
    label: ground + label,
    head: ground + head,
    // The board's outline straddles its edge, so the edge sits half a stroke under the capitals.
    sign: ground + label - (fit.cap ?? 12) + 0.75,
    rail: ground + top + (BAR_HEIGHT - RAIL_HEIGHT) / 2,
    start: ground + start,
    duck: x + bar + DUCK_SPACE + duckWidth / 2,
    reach: Math.round(span / 2 + GROUND_EDGE),
    shrink,
    text: (w - 2 * EDGE) / shrink
  };
}

export type GameText = {
  locale: string;
  loading: string;
  progress: string;
  status: string;
  start: string;
  restart: string;
  result: (amount: string) => string;
  best: (amount: string) => string;
};
export type LoginGame = {setText: (text: GameText) => void; destroy: () => void};
type Wall = {x: number; ox: number; gap: number; c0: number; c: number; oc: number; a: number; f: number; ph: number; done: boolean};
type Colors = {ink: string; paper: string; yellow: string; text: string; sub: string; accent: string; wall: string; base: string; bar: string};

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
  let idle = 0;
  const born = performance.now();

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
      bar: token('--rp-positive')
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
    onCrash(amountText(mb, text!.locale), amountText(best, text!.locale));
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
  // A card of the background colour: cleared first so a wall behind it never shows through a translucent base.
  function plate(fill: string, x: number, y: number, w: number, h: number) {
    g!.save();
    g!.beginPath();
    g!.roundRect(x, y, w, h, 8);
    g!.clip();
    g!.clearRect(x, y, w, h);
    g!.restore();
    shape(fill, () => g!.roundRect(x, y, w, h, 8));
  }
  // The duck, centred on (x, yc) and s tall, mirrored to face right unless left is set.
  function duck(x: number, yc: number, s: number, rot: number, left = false) {
    const k = s / DUCK_BOX.height;
    g!.save();
    g!.translate(x, yc);
    g!.rotate(rot);
    g!.scale(left ? k : -k, k);
    g!.translate(-(DUCK_BOX.x + DUCK_BOX.width / 2), -(DUCK_BOX.y + DUCK_BOX.height / 2));
    for (const [fill, path] of drawing) {
      g!.fillStyle = colors[fill];
      g!.fill(path, 'evenodd');
    }
    g!.restore();
  }
  // A sawhorse barricade b wide at x: splayed legs down to the ground, a rail striped yellow and ink, and the board on top.
  // The legs are paper outlined in ink like the duck, so they hold on a dark background too.
  function barricade(x: number, b: number, board: number, rail: number, floor: number) {
    for (const [top, foot] of [
      [x + 10, x + 5],
      [x + b - 10, x + b - 5]
    ]) {
      shape(colors.paper, () => {
        g!.moveTo(top - 2.5, board);
        g!.lineTo(top + 2.5, board);
        g!.lineTo(foot + 2.5, floor);
        g!.lineTo(foot - 2.5, floor);
        g!.closePath();
      });
    }
    shape(colors.yellow, () => g!.roundRect(x, rail, b, RAIL_HEIGHT, 2));
    g!.save();
    g!.beginPath();
    g!.roundRect(x, rail, b, RAIL_HEIGHT, 2);
    g!.clip();
    g!.fillStyle = colors.ink;
    for (let s = x - RAIL_HEIGHT; s < x + b; s += 12) {
      g!.beginPath();
      g!.moveTo(s, rail + RAIL_HEIGHT);
      g!.lineTo(s + 6, rail + RAIL_HEIGHT);
      g!.lineTo(s + 6 + RAIL_HEIGHT, rail);
      g!.lineTo(s + RAIL_HEIGHT, rail);
      g!.fill();
    }
    g!.restore();
    g!.beginPath();
    g!.roundRect(x, rail, b, RAIL_HEIGHT, 2);
    g!.stroke();
    shape(colors.yellow, () => g!.roundRect(x, board, b, BOARD_HEIGHT, 3));
  }
  // A width, when given, shrinks the text to fit it, so a long translation stays in its place.
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
      // Loading: a bar one notch short of full resting on a stretch of ground, the label and 99% over it, and the duck
      // standing beside it, turned to stare at the gap. Before the bar a barricade in the helmet's colours says the
      // showcase is under construction. Only the dots after the label move.
      g!.font = `600 11px ${font}`;
      const board = Math.ceil(g!.measureText(text.status).width) + 16;
      g!.font = `600 15px ${font}`;
      // The first letter gives the cap height without the ascenders of letters such as d and h.
      const cap = g!.measureText([...text.loading][0] ?? '').actualBoundingBoxAscent;
      const progress = g!.measureText(text.progress).width;
      const L = idleLayout(w, h, {board, row: Math.ceil(g!.measureText(text.loading + '...').width + ROW_GAP + progress), cap});
      g!.save();
      g!.translate(L.cx, h / 2);
      g!.scale(L.shrink, L.shrink);
      g!.translate(-L.cx, -h / 2);
      g!.fillStyle = C.sub;
      g!.fillRect(L.cx - L.reach, L.ground, 2 * L.reach, 1.5);
      barricade(L.post, L.board, L.sign, L.rail, L.ground);
      shape(C.paper, () => g!.roundRect(L.x, L.top, L.bar, BAR_HEIGHT, BAR_HEIGHT / 2));
      g!.fillStyle = C.bar;
      g!.beginPath();
      g!.roundRect(L.x + 4, L.top + 4, (L.bar - 8) * 0.97, BAR_HEIGHT - 8, (BAR_HEIGHT - 8) / 2);
      g!.fill();
      const dots = loadingDots(reduce.matches ? 0 : (performance.now() - born) / 1000);
      g!.textAlign = 'right';
      say(text.progress, L.x + L.bar, L.label, C.text, 15);
      g!.textAlign = 'left';
      say(text.loading + '...'.slice(0, dots), L.x, L.label, C.text, 15, L.bar - ROW_GAP - progress);
      g!.textAlign = 'center';
      g!.textBaseline = 'middle';
      say(text.status, L.post + L.board / 2, L.sign + BOARD_HEIGHT / 2 + 0.5, C.ink, 11, L.board - 16);
      g!.textBaseline = 'alphabetic';
      duck(L.duck, L.ground - IDLE_HEIGHT / 2, IDLE_HEIGHT, -0.06, true);
      if (!reduce.matches) say(text.start, L.cx, L.start, C.sub, undefined, Math.min(360, L.text));
      g!.restore();
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
        // Brick courses in translucent ink (the base colour can be see-through), anchored to the gap edge so a drifting gap carries them along.
        g!.save();
        g!.globalAlpha = 0.35;
        g!.fillStyle = C.ink;
        const top = !from;
        for (let i = 1, yy = (top ? a : b) + (top ? -12 : 12); yy > 1 && yy < ground - 1; i++, yy = (top ? a : b) + (top ? -12 : 12) * i) {
          g!.fillRect(x + 1, yy, WALL - 2, 1);
          g!.fillRect(x + (i % 2 ? 16 : 32), top ? yy + 1 : yy - 11, 1, 11);
        }
        g!.restore();
      }
    }
    g!.strokeStyle = C.sub;
    if (down) {
      // The result sits at the top on a plate of the background colour, away from the crash point.
      plate(C.base, w / 2 - 150, 16, 300, 92);
      say(text.result(amountText(mb, text.locale)), w / 2, 46, C.text, 16);
      say(text.best(amountText(Math.max(best, mb), text.locale)), w / 2, 70, C.sub);
      if (performance.now() - down > 900) say(text.restart, w / 2, 94, C.sub);
    } else {
      // The score keeps a small plate of its own so a wall passing behind it never cuts through the digits.
      plate(C.base, w / 2 - 70, 18, 140, 52);
      say(amountText(mb, text.locale), w / 2, 40, C.text, 16);
      say(rateText(stage, text.locale), w / 2, 60, now - flash < 1.2 && stage ? C.accent : C.sub);
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
    window.clearTimeout(idle);
    if (reduce.matches) playing = false;
    if (!playing || down || reduce.matches || document.hidden || !seen) {
      last = 0;
      // The idle scene redraws on the next dot step, and only while it can be seen and motion is allowed.
      if (!playing && !reduce.matches && !document.hidden && seen) idle = window.setTimeout(run, DOT_STEP - ((performance.now() - born) % DOT_STEP) + 5);
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
      const glyphs = [
        next.loading,
        '.',
        next.progress,
        next.status,
        next.start,
        next.restart,
        next.result(amountText(0, next.locale)),
        next.best(amountText(0, next.locale))
      ].join('');
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
      window.clearTimeout(idle);
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
