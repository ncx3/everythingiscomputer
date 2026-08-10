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
  function composeOS(t) {
    clear();
    frameChrome(true);

    const clock = new Date().toTimeString().slice(0, 8);
    const right = ` SYS.NOMINAL ── ${clock} `;
    text(COLS - 2 - right.length, 0, right, C.text);

    let y = 2;
    text(2, y++, '/', C.dim);
    y++;
    text(2, y, '├─▸ BRIEF', C.text);
    y++;
    text(2, y, '├─▾ PERSONNEL', C.bright);
    text(24, y, '[3]', C.dim);
    for (let x = 1; x < DIVIDER; x++) bg[idx(x, y)] = 'rgba(92,255,174,.12)';
    y++;
    const crew = ['├─ 01 ████████', '├─ 02 ██████████', '└─ 03 ███████'];
    for (const line of crew) {
      text(2, y, '│  ', C.chrome);
      text(5, y, line.slice(0, 6), C.dim);
      text(11, y, line.slice(6), C.redact);
      y++;
    }
    text(2, y, '├─▸ SURVEILLANCE_LOG', C.text);
    text(24, y, '[1]', C.dim);
    y++;
    text(2, y, '└─▸ COMMS', C.text);
    text(24, y, '[4]', C.dim);

    text(2, ROWS - 8, '── LINK ────────────────', C.chrome);
    text(2, ROWS - 7, 'UPLINK ......... STABLE', C.dim);
    text(2, ROWS - 6, 'AUTH ............ GUEST', C.dim);
    text(2, ROWS - 5, 'CLEARANCE ..... LIMITED', C.alert);

    const RX = DIVIDER + 2;
    text(RX, 2, '/PERSONNEL', C.bright);
    hline(RX, 3, COLS - RX - 2, '─', C.chrome);

    const records = [
      ['01', '████████', '███████████'],
      ['02', '██████████', '█████████'],
      ['03', '███████', '████████████'],
    ];

    let ry = 5;
    for (const [n, name, role] of records) {
      text(RX, ry, `▸ ${n}`, C.amber);
      text(RX + 6, ry, name, C.redact);
      ry++;
      text(RX + 6, ry, 'ROLE ............. ', C.chrome);
      text(RX + 25, ry, role, C.redact);
      ry++;
      text(RX + 6, ry, 'CLEARANCE ........ ', C.chrome);
      text(RX + 25, ry, 'AAA', C.dim);
      ry += 2;
    }

    text(RX, ROWS - 6, '3 RECORDS ── END OF DIRECTORY', C.chrome);
    text(COLS - 22, ROWS - 6, ' GENOCYBER INTERNAL ', C.alert);

    text(2, ROWS - 2, '>', C.text);
    text(4, ROWS - 2, 'open /personnel', C.bright);
    if (Math.floor(t * 1.6) % 2 === 0) text(20, ROWS - 2, '█', C.text);

    paint(t);
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

    // phosphor bloom: one blurred copy under the crisp text
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(7px)';
    ctx.globalAlpha = 0.55;
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
