/**
 * Placeholder content for the deck's screen.
 *
 * Two modes:
 *   boot — the landing card: GENOCYBER OS chrome + the game title + enter prompt
 *   os   — a MOCK of the two-pane TUI, for judging framing and legibility
 *
 * Both are painted to a canvas so we can see them on the real curved glass.
 * In the real build this canvas goes away and the TUI becomes real DOM in the
 * locked-camera layer. Rendered on a strict character grid, the way a
 * text-mode display works.
 */

import * as THREE from 'three';
import { PERSONNEL, BRIEF, SURVEILLANCE, COMMS, SECTIONS } from './content.js';

/** Greedy word wrap onto a character grid. */
function wrap(str, width) {
  const lines = [];
  let line = '';
  for (let word of String(str).split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

const W = 2560;
const H = 1684; // 1.5202 — matches the screen mesh's real aspect
const COLS = 96;
const ROWS = 33;

const CELL_W = W / COLS;
const CELL_H = H / ROWS;

const C = {
  chrome: '#2f8a60',
  dim: '#3ea877',
  text: '#5cffae',
  bright: '#c9ffe4',
  alert: '#ff6b5c',
  amber: '#ffc457',
  redact: '#1f6547',
};

const DIVIDER = 29; // column of the vertical pane divider

export function createScreenMock() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Text is drawn to its own layer so we can composite a cheap phosphor
  // bloom (one blurred copy) instead of shadowBlur on every glyph.
  const textCanvas = document.createElement('canvas');
  textCanvas.width = W;
  textCanvas.height = H;
  const tctx = textCanvas.getContext('2d');

  const FONT_STACK = 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", Consolas, monospace';
  tctx.font = `100px ${FONT_STACK}`;
  const advance = tctx.measureText('M').width || 60;
  const FONT_SIZE = (100 * CELL_W) / advance;
  const FONT = `${FONT_SIZE.toFixed(2)}px ${FONT_STACK}`;
  const BASELINE = CELL_H * 0.74;

  const scan = makeScanlinePattern(ctx);

  const chars = new Array(COLS * ROWS);
  const fg = new Array(COLS * ROWS);
  const bg = new Array(COLS * ROWS);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  let mode = 'boot';
  // The aperture is a rounded rect, so the UI is clipped to match and held
  // clear of the corner curves. Both are fractions of the canvas, measured
  // by GENO.calibrate().
  let radius = 0.055;
  let marginX = 0.018;
  let marginY = 0.028;

  /** Phosphor emission around the glyphs. Tune live with GENO.glow(). */
  const glow = { core: 4, coreAlpha: 0.5, halo: 19, haloAlpha: 0.2 };

  let section = 'personnel';
  let selected = PERSONNEL[0]?.code;
  let hover = null;

  /**
   * Clickable areas, in character cells, rebuilt on every compose. main.js
   * raycasts the glass, converts the hit to UV, and asks hitTest() what's there.
   */
  let regions = [];
  const region = (x, y, w, h, id) => regions.push({ x, y, w, h, id });

  /** Portraits load lazily; a repaint is forced once each one arrives. */
  const images = new Map();
  function image(url) {
    if (!url) return null;
    let img = images.get(url);
    if (!img) {
      img = new Image();
      img.onload = () => { last = -1; };
      img.src = url;
      images.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // ---- grid primitives -------------------------------------------------
  const idx = (x, y) => y * COLS + x;
  const inBounds = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

  function clear() {
    chars.fill(' ');
    fg.fill(C.dim);
    bg.fill(null);
  }

  function put(x, y, ch, color, back) {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    chars[i] = ch;
    fg[i] = color || C.dim;
    if (back !== undefined) bg[i] = back;
  }

  function text(x, y, str, color, back) {
    for (let k = 0; k < str.length; k++) put(x + k, y, str[k], color, back);
  }

  function hline(x, y, w, ch, color) {
    for (let k = 0; k < w; k++) put(x + k, y, ch, color);
  }

  /** The window chrome both modes share, so boot and os feel like one machine. */
  function frameChrome(withDivider) {
    hline(0, 0, COLS, '─', C.chrome);
    put(0, 0, '┌', C.chrome);
    put(COLS - 1, 0, '┐', C.chrome);

    for (let y = 1; y <= ROWS - 4; y++) {
      put(0, y, '│', C.chrome);
      put(COLS - 1, y, '│', C.chrome);
      if (withDivider) put(DIVIDER, y, '│', C.chrome);
    }

    hline(0, ROWS - 3, COLS, '─', C.chrome);
    put(0, ROWS - 3, '├', C.chrome);
    put(COLS - 1, ROWS - 3, '┤', C.chrome);
    if (withDivider) put(DIVIDER, ROWS - 3, '┴', C.chrome);

    put(0, ROWS - 2, '│', C.chrome);
    put(COLS - 1, ROWS - 2, '│', C.chrome);

    hline(0, ROWS - 1, COLS, '─', C.chrome);
    put(0, ROWS - 1, '└', C.chrome);
    put(COLS - 1, ROWS - 1, '┘', C.chrome);

    text(2, 0, ' GENOCYBER OS ', C.bright);
    text(16, 0, ' v2.7.1 ', C.dim);
  }

  // ---- boot / landing card ---------------------------------------------
  function composeBoot(t) {
    clear();
    frameChrome(false);

    const right = ' SYS.NOMINAL ── AWAITING INPUT ';
    text(COLS - 2 - right.length, 0, right, C.text);

    text(2, ROWS - 2, '> _', C.chrome);

    paint(t, (x) => {
      x.textAlign = 'center';

      // eyebrow
      x.font = `${(CELL_H * 0.62).toFixed(1)}px ${FONT_STACK}`;
      x.letterSpacing = `${CELL_W * 0.6}px`;
      x.fillStyle = C.text;
      x.fillText('GENOCYBER  SYSTEMS', W / 2, H * 0.305);

      // the title
      x.font = `${Math.round(CELL_H * 2.5)}px ${FONT_STACK}`;
      x.letterSpacing = `${CELL_W * 0.34}px`;
      x.fillStyle = C.text;
      x.fillText('EVERYTHING', W / 2, H * 0.475);
      x.fillText('IS COMPUTER', W / 2, H * 0.475 + CELL_H * 2.9);

      // rule
      x.letterSpacing = '0px';
      x.strokeStyle = 'rgba(92,255,174,.35)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(W * 0.3, H * 0.665);
      x.lineTo(W * 0.7, H * 0.665);
      x.stroke();

      // enter prompt — pulses rather than blinks, so it is never simply absent
      x.font = `${(CELL_H * 0.72).toFixed(1)}px ${FONT_STACK}`;
      x.letterSpacing = `${CELL_W * 0.4}px`;
      x.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.0));
      x.fillStyle = C.text;
      x.fillText('[ CLICK TO ENTER ]', W / 2, H * 0.775);
      x.globalAlpha = 1;

      x.textAlign = 'left';
      x.letterSpacing = '0px';
    });
  }

  // ---- the OS ----------------------------------------------------------
  const RX = DIVIDER + 2; // left column of the content pane
  const RW = COLS - RX - 2; // its width in characters

  function highlightRow(y, from, to, alpha = 0.12) {
    for (let x = from; x < to; x++) bg[idx(x, y)] = `rgba(92,255,174,${alpha})`;
  }

  /** Mark a row clickable, and light it up when the cursor is over it. */
  function row(y, from, to, id, active) {
    region(from, y, to - from, 1, id);
    if (active) highlightRow(y, from, to, 0.12);
    else if (hover === id) highlightRow(y, from, to, 0.07);
  }

  function drawTree() {
    let y = 2;
    text(2, y++, '/', C.dim);
    y++;
    SECTIONS.forEach((s, i) => {
      const last = i === SECTIONS.length - 1;
      const open = s.id === section;
      const expandable = s.id === 'personnel';
      const arm = last && !(open && expandable) ? '└' : '├';
      text(2, y, `${arm}─${open ? '▾' : '▸'} ${s.label}`, open ? C.bright : C.text);
      if (s.count !== null) text(24, y, `[${s.count}]`, C.dim);
      row(y, 1, DIVIDER, s.id, open);
      y++;

      if (open && expandable) {
        PERSONNEL.forEach((p, j) => {
          const tail = j === PERSONNEL.length - 1;
          text(2, y, last ? '   ' : '│  ', C.chrome);
          text(5, y, `${tail ? '└' : '├'}─ ${p.code}`, p.code === selected ? C.amber : C.dim);
          row(y, 1, DIVIDER, p.code, p.code === selected);
          y++;
        });
      }
    });

    text(2, ROWS - 8, '── LINK ────────────────', C.chrome);
    text(2, ROWS - 7, 'UPLINK ......... STABLE', C.dim);
    text(2, ROWS - 6, 'AUTH ............ GUEST', C.dim);
    text(2, ROWS - 5, 'CLEARANCE ..... LIMITED', C.alert);
  }

  function drawBrief() {
    let y = 5;
    for (const para of BRIEF) {
      for (const line of wrap(para, RW)) {
        if (y > ROWS - 7) return;
        text(RX, y++, line, C.text);
      }
      y++;
    }
  }

  const PORTRAIT_W = 17; // columns
  const PORTRAIT_H = 9; // rows — ~square once cell aspect is accounted for

  function drawPersonnel() {
    let y = 5;
    for (const p of PERSONNEL) {
      const on = p.code === selected;
      text(RX, y, on ? '▸' : ' ', C.amber);
      text(RX + 2, y, p.code, on ? C.amber : C.dim);
      text(RX + 12, y, p.name.toUpperCase(), on ? C.bright : C.text);
      row(y, RX - 1, COLS - 2, p.code, on);
      y++;
    }

    y++;
    hline(RX, y++, RW, '─', C.chrome);

    const p = PERSONNEL.find((x) => x.code === selected) || PERSONNEL[0];

    // Photo on the left, the description set beside it — the way a personnel
    // file is laid out.
    const tx = RX + PORTRAIT_W + 2;
    const textW = COLS - 2 - tx;
    portrait = { p, x: RX, y };

    text(tx, y, `${p.code} / ${p.name.toUpperCase()}`, C.bright);
    y++;
    if (p.alias) {
      text(tx, y, 'ALIAS ... ', C.chrome);
      text(tx + 10, y++, p.alias.toUpperCase(), C.dim);
    }
    text(tx, y, 'CLASS ... ', C.chrome);
    text(tx + 10, y++, p.role, C.dim);
    y++;
    for (const line of wrap(p.bio, textW)) {
      if (y > ROWS - 7) break;
      text(tx, y++, line, C.text);
    }
  }

  /**
   * Portraits are drawn on the text layer so they pick up the same phosphor
   * bloom as the glyphs, then knocked to a green duotone — an image pulled off
   * an archive terminal, not a press shot.
   */
  function paintPortrait(x, spec) {
    const { p } = spec;
    const gx = spec.x * CELL_W;
    const gy = spec.y * CELL_H;
    const gw = PORTRAIT_W * CELL_W;
    const gh = PORTRAIT_H * CELL_H;

    const img = image(p.portrait);
    x.save();
    x.beginPath();
    x.rect(gx, gy, gw, gh);
    x.clip();

    if (img) {
      // Held deliberately low: the source photographs vary a lot in exposure,
      // and a light background turns into a wall of green if it is pushed.
      x.filter = 'grayscale(1) contrast(1.25) brightness(1.02)';
      const s = Math.max(gw / img.naturalWidth, gh / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      x.drawImage(img, gx + (gw - w) / 2, gy + (gh - h) / 2, w, h);
      x.filter = 'none';
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = C.text;
      x.fillRect(gx, gy, gw, gh);
      x.globalCompositeOperation = 'source-over';
      // interlace the portrait so it reads as a scanned frame
      x.fillStyle = 'rgba(0,0,0,.30)';
      for (let k = 0; k < gh; k += 6) x.fillRect(gx, gy + k, gw, 3);
    } else {
      x.fillStyle = 'rgba(92,255,174,.05)';
      x.fillRect(gx, gy, gw, gh);
    }
    x.restore();

    // corner brackets
    x.strokeStyle = C.dim;
    x.lineWidth = 3;
    const b = CELL_W * 1.1;
    for (const [cx, cy, sx, sy] of [
      [gx, gy, 1, 1],
      [gx + gw, gy, -1, 1],
      [gx, gy + gh, 1, -1],
      [gx + gw, gy + gh, -1, -1],
    ]) {
      x.beginPath();
      x.moveTo(cx + sx * b, cy);
      x.lineTo(cx, cy);
      x.lineTo(cx, cy + sy * b);
      x.stroke();
    }
  }

  function drawSurveillance() {
    let y = 5;
    for (const s of SURVEILLANCE) {
      text(RX, y, `▸ ${s.label}`, C.amber);
      text(RX + 24, y++, s.status, C.alert);
    }
    y++;
    text(RX, y, '┌' + '─'.repeat(RW - 2) + '┐', C.chrome);
    for (let k = 0; k < 7; k++) text(RX, y + 1 + k, '│' + ' '.repeat(RW - 2) + '│', C.chrome);
    text(RX, y + 8, '└' + '─'.repeat(RW - 2) + '┘', C.chrome);
    text(RX + Math.floor((RW - 13) / 2), y + 4, '[ NO SIGNAL ]', C.redact);
  }

  function drawComms() {
    let y = 5;
    for (const c of COMMS) {
      text(RX, y, `▸ ${c.label}`, C.amber);
      text(RX + 16, y, '.'.repeat(14), C.chrome);
      text(RX + 32, y++, c.value, C.redact);
      y++;
    }
  }

  let portrait = null;

  function composeOS(t) {
    clear();
    regions = [];
    portrait = null;
    frameChrome(true);

    const clock = new Date().toTimeString().slice(0, 8);
    const right = ` SYS.NOMINAL ── ${clock} `;
    text(COLS - 2 - right.length, 0, right, C.text);

    drawTree();

    const s = SECTIONS.find((x) => x.id === section) || SECTIONS[0];
    text(RX, 2, `/${s.label}`, C.bright);
    hline(RX, 3, RW, '─', C.chrome);

    if (section === 'brief') drawBrief();
    else if (section === 'personnel') drawPersonnel();
    else if (section === 'surveillance') drawSurveillance();
    else drawComms();

    const footer =
      s.count !== null ? `${s.count} RECORD${s.count === 1 ? '' : 'S'} ── END OF DIRECTORY` : 'END OF FILE';
    text(RX, ROWS - 6, footer, C.chrome);
    text(COLS - 22, ROWS - 6, ' GENOCYBER INTERNAL ', C.alert);

    const cmd = `open /${s.label.toLowerCase()}`;
    text(2, ROWS - 2, '>', C.text);
    text(4, ROWS - 2, cmd, C.bright);
    if (Math.floor(t * 1.6) % 2 === 0) text(5 + cmd.length, ROWS - 2, '█', C.text);

    paint(t, portrait ? (x) => paintPortrait(x, portrait) : undefined);
  }

  // ---- paint -----------------------------------------------------------
  function paint(t, drawExtra) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.44, H * 0.1, W * 0.5, H * 0.5, H * 0.95);
    grad.addColorStop(0, '#08160f');
    grad.addColorStop(1, '#030805');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    tctx.clearRect(0, 0, W, H);
    tctx.font = FONT;
    tctx.textBaseline = 'alphabetic';
    tctx.textAlign = 'left';
    tctx.letterSpacing = '0px';

    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        const b = bg[idx(x, y)];
        if (b) {
          let run = 1;
          while (x + run < COLS && bg[idx(x + run, y)] === b) run++;
          tctx.fillStyle = b;
          tctx.fillRect(x * CELL_W, y * CELL_H, run * CELL_W, CELL_H);
          x += run;
        } else x++;
      }
      x = 0;
      while (x < COLS) {
        const color = fg[idx(x, y)];
        let run = 1;
        while (x + run < COLS && fg[idx(x + run, y)] === color && chars[idx(x + run, y)] !== ' ') run++;
        let str = '';
        for (let k = 0; k < run; k++) str += chars[idx(x + k, y)];
        if (str.trim()) {
          tctx.fillStyle = color;
          tctx.fillText(str, x * CELL_W, y * CELL_H + BASELINE);
        }
        x += run;
      }
    }

    if (drawExtra) {
      tctx.textBaseline = 'middle';
      drawExtra(tctx);
      tctx.textBaseline = 'alphabetic';
    }

    // The UI is drawn inset so its frame clears the aperture's rounded corners.
    const mx = W * marginX;
    const my = H * marginY;
    const dw = W - mx * 2;
    const dh = H - my * 2;

    // Phosphor emission, in two passes under the crisp glyphs: a tight core
    // that thickens the strokes, and a wide low halo that reads as light
    // actually coming off the tube rather than a blur effect.
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${glow.halo}px)`;
    ctx.globalAlpha = glow.haloAlpha;
    ctx.drawImage(textCanvas, 0, 0, W, H, mx, my, dw, dh);
    ctx.filter = `blur(${glow.core}px)`;
    ctx.globalAlpha = glow.coreAlpha;
    ctx.drawImage(textCanvas, 0, 0, W, H, mx, my, dw, dh);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.drawImage(textCanvas, 0, 0, W, H, mx, my, dw, dh);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = scan;
    ctx.fillRect(0, 0, W, H);

    const bandY = ((t * 0.06) % 1.4 - 0.2) * H;
    const band = ctx.createLinearGradient(0, bandY, 0, bandY + H * 0.16);
    band.addColorStop(0, 'rgba(92,255,174,0)');
    band.addColorStop(0.5, 'rgba(92,255,174,.035)');
    band.addColorStop(1, 'rgba(92,255,174,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY, W, H * 0.16);

    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.35, W * 0.5, H * 0.5, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Clip to the aperture's rounded rectangle — the glass has soft corners,
    // and square content spilling into them is what reads as "broken".
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, radius * W);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    texture.needsUpdate = true;
  }

  let last = -1;
  return {
    texture,
    aspect: W / H,
    get mode() {
      return mode;
    },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      last = -1; // force an immediate repaint
    },
    get section() {
      return section;
    },
    /** Open a section, or select a personnel record by its code. */
    open(id) {
      const rec = PERSONNEL.find((p) => p.code === id);
      if (rec) {
        section = 'personnel';
        selected = rec.code;
      } else if (SECTIONS.some((s) => s.id === id)) {
        section = id;
      } else return { section, selected };
      last = -1;
      return { section, selected };
    },
    /**
     * A UV coordinate on the glass -> whatever is clickable under it.
     * Undoes the safe-margin transform the UI is drawn through.
     */
    hitTest(u, v) {
      if (mode !== 'os') return null;
      const gx = (COLS * (u - marginX)) / (1 - 2 * marginX);
      const gy = (ROWS * (1 - v - marginY)) / (1 - 2 * marginY);
      for (const r of regions) {
        if (gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h) return r.id;
      }
      return null;
    },
    setHover(id) {
      if (id === hover) return false;
      hover = id;
      last = -1;
      return true;
    },
    cycle(dir) {
      const i = SECTIONS.findIndex((s) => s.id === section);
      section = SECTIONS[(i + dir + SECTIONS.length) % SECTIONS.length].id;
      last = -1;
      return section;
    },
    cycleRecord(dir) {
      const i = PERSONNEL.findIndex((p) => p.code === selected);
      selected = PERSONNEL[(i + dir + PERSONNEL.length) % PERSONNEL.length].code;
      section = 'personnel';
      last = -1;
      return selected;
    },
    /** How much light the glyphs give off. GENO.glow({ haloAlpha: .3 }) */
    setGlow(next) {
      if (next) Object.assign(glow, next);
      last = -1;
      return { ...glow };
    },
    /** Corner radius and safe margins, as fractions of the canvas. */
    setShape(r, mX, mY) {
      if (r !== undefined) radius = r;
      if (mX !== undefined) marginX = mX;
      if (mY !== undefined) marginY = mY;
      last = -1;
      return { radius, marginX, marginY };
    },
    /** Repaint at ~8fps; the content barely changes and this is a mock. */
    update(t) {
      if (t - last < 0.125) return;
      last = t;
      if (mode === 'boot') composeBoot(t);
      else composeOS(t);
    },
    dispose() {
      texture.dispose();
    },
  };
}

function makeScanlinePattern(ctx) {
  const p = document.createElement('canvas');
  p.width = 1;
  p.height = 4;
  const c = p.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,.34)';
  c.fillRect(0, 0, 1, 2);
  c.fillStyle = 'rgba(0,0,0,0)';
  c.fillRect(0, 2, 1, 2);
  return ctx.createPattern(p, 'repeat');
}
