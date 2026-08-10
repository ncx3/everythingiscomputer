/**
 * GENOCYBER — deck placement test.
 *
 * Landing shows the title card on the deck's glass; clicking dollies the
 * camera in until the glass fills the frame, where it LOCKS and the OS takes
 * over. That locked state is what lets a DOM layer be pinned exactly to the
 * glass — the architecture the whole site rests on.
 *
 *   contain / cover — landing framings, title card on screen
 *   docked          — camera locked, OS on screen, DOM pinnable
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createScreenMock } from './screen-mock.js';

/**
 * The screen MESH runs underneath the bezel — its outer edge is never visible.
 * These are the fractions of the mesh eaten by the chassis on each side, in
 * VIEWER space (l/r/t/b as you see them). Measured, not guessed: GENO.calibrate()
 * renders the screen as flat magenta and reads back where it actually shows.
 */
const SCREEN_INSET = { l: 0.012, r: 0.010, t: 0.015, b: 0.009 };

/**
 * The aperture is a rounded rectangle, not a sharp one. This is its corner
 * radius as a fraction of aperture width — also measured by calibrate(). The
 * DOM layer and the screen content are both shaped to it, otherwise square
 * corners spill onto the bezel.
 */
let screenRadius = 0.055;

const FRAMINGS = {
  contain: { pad: 1.06, mode: 'contain', of: 'model' },
  cover: { pad: 1.0, mode: 'cover', of: 'model' },
  docked: { pad: 1.3, mode: 'contain', of: 'screen' },
};

const canvas = document.getElementById('gl');
const loadingEl = document.getElementById('loading');
const pctEl = document.getElementById('pct');
const domLayer = document.getElementById('domlayer');
const domRect = document.getElementById('domrect');

// ── renderer ────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 100);

// ── environment & lights ────────────────────────────────────────────────
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

// Key sits high and outboard so its specular streak lands on the bezel
// rather than across the middle of the readable area.
const key = new THREE.DirectionalLight(0xd7e6ff, 2.1);
key.position.set(-3.4, 3.2, -2.6);
scene.add(key);

const fill = new THREE.DirectionalLight(0x71a0ff, 0.7);
fill.position.set(3.0, -0.6, -2.2);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x5cffae, 1.1);
rim.position.set(0.6, 1.0, 3.0);
scene.add(rim);

scene.add(new THREE.AmbientLight(0x223344, 0.6));
scene.add(makeBackdrop());

/**
 * The screen is a light source, not just a bright surface. A rect-area emitter
 * matched to the glass throws phosphor green onto the bezel's inner chamfer and
 * the camera arm — which is what actually sells the thing as switched on.
 */
RectAreaLightUniformsLib.init();
// `spread` oversizes the emitter relative to the glass. A light exactly the
// size of the aperture concentrates on the chamfer right around it; a larger,
// dimmer one falls off gently and reaches the whole chassis instead.
const SPILL = { intensity: 0.5, spread: 1.9 };

const screenLight = new THREE.RectAreaLight(0x5cffae, SPILL.intensity, 1, 1);
screenLight.visible = false; // until the glass is measured
scene.add(screenLight);

function updateScreenLight() {
  if (!glass) return;
  screenLight.width = glass.width * SPILL.spread;
  screenLight.height = glass.height * SPILL.spread;
  screenLight.intensity = SPILL.intensity;
  screenLight.position.copy(glass.center).addScaledVector(screenNormal, 0.02);
  screenLight.lookAt(glass.center.clone().addScaledVector(screenNormal, 1));
  screenLight.visible = true;
}

// ── state ───────────────────────────────────────────────────────────────
const timer = new THREE.Timer();
const screenMock = createScreenMock();

let deck = null;
let screenMesh = null;
let screenNormal = new THREE.Vector3(0, 0, -1); // world space, points at the viewer
let glass = null; // { corners[4], center, width, height } of the VISIBLE aperture
const modelBox = new THREE.Box3();

let framing = 'contain';
let bloomOn = true;
let driftOn = false;
let domOn = false;
let modeTimer = 0;

const rig = {
  target: new THREE.Vector3(),
  distance: 3,
  from: { target: new THREE.Vector3(), distance: 3 },
  to: { target: new THREE.Vector3(), distance: 3 },
  t: 1,
  dur: 1.35,
};

const look = { yaw: 0, pitch: 0, yawTo: 0, pitchTo: 0, zoom: 1 };
const pointer = { x: 0, y: 0, dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, moved: 0 };

// ── load ────────────────────────────────────────────────────────────────
new GLTFLoader().load(
  '/models/deck.glb',
  (gltf) => {
    deck = gltf.scene;
    scene.add(deck);
    deck.updateWorldMatrix(true, true);

    screenMesh = deck.getObjectByName('Screen_Low.001_Monitor_0');
    if (!screenMesh) {
      deck.traverse((o) => {
        if (o.isMesh && /screen/i.test(o.name) && !screenMesh) screenMesh = o;
      });
    }

    if (screenMesh) {
      screenNormal = averageWorldNormal(screenMesh);
      glass = mapScreen(screenMesh, screenNormal, SCREEN_INSET);
      updateScreenLight();
      screenMesh.material = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: screenMock.texture,
        emissiveIntensity: 1.35,
        roughness: 0.3,
        metalness: 0.0,
        envMapIntensity: 0.35,
      });
    }

    modelBox.setFromObject(deck);
    // Land on COVER: the deck is roughly square and viewports are widescreen,
    // so containing it leaves black bars down both sides. Covering fills the
    // viewport and only crops the speaker pod and the top of the camera arm.
    setFraming('cover', true);

    loadingEl.classList.add('done');
    setTimeout(() => loadingEl.remove(), 700);
  },
  (e) => {
    if (e.lengthComputable) pctEl.textContent = `${Math.round((e.loaded / e.total) * 100)}%`;
  },
  (err) => {
    pctEl.textContent = 'FAILED';
    console.error('[genocyber] deck failed to load', err);
  }
);

// ── post ────────────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.24, // strength — the chassis buttons blow out fast, keep this low
  0.85, // radius — wide, so the halo carries across the frame instead of hugging edges
  0.70 // low enough that the phosphor text blooms, high enough to spare the bezel
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(window.innerWidth, window.innerHeight);

// ── framing ─────────────────────────────────────────────────────────────
function setFraming(name, instant = false) {
  if (!FRAMINGS[name] || !deck) return;
  framing = name;
  const f = FRAMINGS[name];

  let center, size;

  if (f.of === 'screen' && glass) {
    center = glass.center.clone();
    size = new THREE.Vector3(glass.width, glass.height, 0.02);
  } else {
    // Anchor on the glass but size to contain the whole deck. Framing on the
    // raw bounding box shoves the chassis off-centre, because the cables sweep
    // out to one side and drag the box centre with them.
    center = glass ? glass.center.clone() : modelBox.getCenter(new THREE.Vector3());
    const halfX = Math.max(center.x - modelBox.min.x, modelBox.max.x - center.x);
    const halfY = Math.max(center.y - modelBox.min.y, modelBox.max.y - center.y);
    size = new THREE.Vector3(halfX * 2, halfY * 2, modelBox.max.z - modelBox.min.z);
    center.z = (modelBox.min.z + modelBox.max.z) * 0.5;
  }

  const dist = fitDistance(size, camera, f.mode, f.pad);

  rig.from.target.copy(rig.target);
  rig.from.distance = rig.distance;
  rig.to.target.copy(center);
  rig.to.distance = dist;
  rig.t = instant ? 1 : 0;

  if (instant) {
    rig.target.copy(center);
    rig.distance = dist;
  }

  look.zoom = 1;

  // The screen's content follows the framing: landing shows the title card,
  // docked shows the OS. Switching partway through the dolly reads as the
  // machine waking up as you arrive.
  clearTimeout(modeTimer);
  if (name === 'docked') {
    look.yawTo = 0;
    look.pitchTo = 0;
    if (instant) screenMock.setMode('os');
    else modeTimer = setTimeout(() => screenMock.setMode('os'), 420);
  } else {
    screenMock.setMode('boot');
  }

  document.body.classList.toggle('landing', name !== 'docked');

  for (const b of document.querySelectorAll('#hud [data-state]')) {
    b.classList.toggle('on', b.dataset.state === name);
  }
}

function fitDistance(size, cam, mode, pad) {
  const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
  const dH = (size.y * pad * 0.5) / half;
  const dW = (size.x * pad * 0.5) / (half * cam.aspect);
  const d = mode === 'cover' ? Math.min(dH, dW) : Math.max(dH, dW);
  return d + size.z * 0.5;
}

// ── screen mapping ──────────────────────────────────────────────────────

/** Average vertex normal in world space, flipped to face the viewer (-Z). */
function averageWorldNormal(mesh) {
  const n = mesh.geometry.attributes.normal;
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) acc.add(v.fromBufferAttribute(n, i));
  acc.normalize().transformDirection(mesh.matrixWorld).normalize();
  if (acc.z > 0) acc.negate();
  return acc;
}

/**
 * The screen's shipped UVs are useless to us — it occupies a corner of a shared
 * 4K atlas, and all three UV sets are identical. Rebuild a clean planar unwrap
 * across the face, inset by the bezel overlap, oriented so texture-right is
 * viewer-right and texture-up is world-up.
 *
 * Returns the visible aperture as four world-space corners; the DOM layer and
 * the docked framing both key off it.
 */
function mapScreen(mesh, normalWorld, inset) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);

  const comp = ['x', 'y', 'z'];
  const extents = [size.x, size.y, size.z];
  const nAxis = extents.indexOf(Math.min(...extents)); // thinnest axis is the normal
  const [uAxis, vAxis] = [0, 1, 2].filter((a) => a !== nAxis);

  const axisVec = (a) => new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);
  const camRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normalWorld).normalize();
  const uWorld = axisVec(uAxis).transformDirection(mesh.matrixWorld).normalize();
  const vWorld = axisVec(vAxis).transformDirection(mesh.matrixWorld).normalize();

  const flipU = uWorld.dot(camRight) < 0;
  const flipV = vWorld.y < 0;

  // Insets are expressed in viewer space; map them onto the local axes.
  const uLoCut = flipU ? inset.r : inset.l;
  const uHiCut = flipU ? inset.l : inset.r;
  const vLoCut = flipV ? inset.t : inset.b;
  const vHiCut = flipV ? inset.b : inset.t;

  const uKeep = 1 - inset.l - inset.r;
  const vKeep = 1 - inset.t - inset.b;

  // ---- UVs: 0..1 across the VISIBLE region, clamped outside it ----------
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const uMin = bb.min[comp[uAxis]];
  const vMin = bb.min[comp[vAxis]];
  const uSpan = extents[uAxis] || 1;
  const vSpan = extents[vAxis] || 1;
  const p = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let u = (p[comp[uAxis]] - uMin) / uSpan;
    let v = (p[comp[vAxis]] - vMin) / vSpan;
    if (flipU) u = 1 - u;
    if (flipV) v = 1 - v;
    uv[i * 2] = (u - inset.l) / uKeep;
    uv[i * 2 + 1] = (v - inset.b) / vKeep;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  // ---- the visible aperture, as four world corners ----------------------
  // Corners sit on the tube's rim, not the dome, so pin the normal-axis
  // coordinate to the rim: the extreme opposite the outward normal.
  const localNormal = new THREE.Vector3();
  {
    const na = geo.attributes.normal;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < na.count; i++) localNormal.add(tmp.fromBufferAttribute(na, i));
    localNormal.normalize();
  }
  const rimN = localNormal[comp[nAxis]] > 0 ? bb.min[comp[nAxis]] : bb.max[comp[nAxis]];

  const uLo = uMin + uLoCut * uSpan;
  const uHi = uMin + (1 - uHiCut) * uSpan;
  const vLo = vMin + vLoCut * vSpan;
  const vHi = vMin + (1 - vHiCut) * vSpan;

  const corner = (uu, vv) => {
    const c = new THREE.Vector3();
    c[comp[uAxis]] = uu;
    c[comp[vAxis]] = vv;
    c[comp[nAxis]] = rimN;
    return c.applyMatrix4(mesh.matrixWorld);
  };

  const corners = [corner(uLo, vLo), corner(uHi, vLo), corner(uHi, vHi), corner(uLo, vHi)];
  const center = new THREE.Vector3();
  for (const c of corners) center.add(c);
  center.multiplyScalar(0.25);

  return {
    corners,
    center,
    width: corners[0].distanceTo(corners[1]),
    height: corners[1].distanceTo(corners[2]),
  };
}

function makeBackdrop() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 236, 20, 256, 256, 300);
  g.addColorStop(0, '#16232b');
  g.addColorStop(0.45, '#0a1015');
  g.addColorStop(1, '#04070a');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 22),
    new THREE.MeshBasicMaterial({ map: tex, depthWrite: false })
  );
  mesh.position.z = 6;
  mesh.renderOrder = -1;
  return mesh;
}

// ── DOM pinning ─────────────────────────────────────────────────────────
const _v = new THREE.Vector3();
function projectQuad(corners, w, h, yUp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    _v.copy(c).project(camera);
    const sx = (_v.x * 0.5 + 0.5) * w;
    const sy = yUp ? (_v.y * 0.5 + 0.5) * h : (-_v.y * 0.5 + 0.5) * h;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function updateDomRect() {
  if (!domOn || !glass) return;
  const r = projectQuad(glass.corners, window.innerWidth, window.innerHeight, false);
  domRect.style.left = `${r.minX}px`;
  domRect.style.top = `${r.minY}px`;
  domRect.style.width = `${r.w}px`;
  domRect.style.height = `${r.h}px`;
  domRect.style.borderRadius = `${r.w * screenRadius}px`;
}

// ── picking the screen ──────────────────────────────────────────────────
// The UI lives on curved glass, so a click is a raycast: hit the screen mesh,
// take the interpolated UV, and ask the screen what is under that point.
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

function pickScreen(clientX, clientY) {
  if (!screenMesh || framing !== 'docked') return null;
  _ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const hit = raycaster.intersectObject(screenMesh, false)[0];
  return hit?.uv ? screenMock.hitTest(hit.uv.x, hit.uv.y) : null;
}

// ── input ───────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

addEventListener('pointerdown', (e) => {
  if (e.target instanceof Element && e.target.closest('#hud')) return;
  pointer.dragging = true;
  pointer.lastX = pointer.downX = e.clientX;
  pointer.lastY = pointer.downY = e.clientY;
  pointer.moved = 0;
});

addEventListener('pointerup', (e) => {
  const wasDragging = pointer.dragging;
  pointer.dragging = false;
  if (!wasDragging || pointer.moved >= 6) return;
  if (framing !== 'docked') {
    setFraming('docked'); // a click, not a drag — and we're still outside
    return;
  }
  const hit = pickScreen(e.clientX, e.clientY);
  if (hit) screenMock.open(hit);
});
addEventListener('pointercancel', () => (pointer.dragging = false));

addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;

  if (!pointer.dragging) {
    const hit = pickScreen(e.clientX, e.clientY);
    screenMock.setHover(hit);
    document.body.classList.toggle('over-ui', !!hit);
  }

  if (!pointer.dragging) return;
  pointer.moved += Math.abs(e.clientX - pointer.lastX) + Math.abs(e.clientY - pointer.lastY);
  look.yawTo = clamp(look.yawTo + (e.clientX - pointer.lastX) * 0.0022, -0.32, 0.32);
  look.pitchTo = clamp(look.pitchTo - (e.clientY - pointer.lastY) * 0.0022, -0.22, 0.22);
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
});

addEventListener('wheel', (e) => {
  look.zoom = clamp(look.zoom * (1 + Math.sign(e.deltaY) * 0.06), 0.45, 2.0);
}, { passive: true });

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === '1') setFraming('contain');
  if (k === '2') setFraming('cover');
  if (k === '3' || k === 'enter') setFraming('docked');
  if (k === 'escape') setFraming('contain');
  if (k === 'd') toggle('dom');
  if (k === 'b') toggle('bloom');
  if (k === 'r') toggle('drift');
  // browse the mock's content
  if (e.key === '[') screenMock.cycle(-1);
  if (e.key === ']') screenMock.cycle(1);
  if (e.key === 'ArrowUp') screenMock.cycleRecord(-1);
  if (e.key === 'ArrowDown') screenMock.cycleRecord(1);
});

document.getElementById('hud').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.state) setFraming(btn.dataset.state);
  if (btn.dataset.toggle) toggle(btn.dataset.toggle);
});

function toggle(what) {
  if (what === 'dom') { domOn = !domOn; domLayer.hidden = !domOn; }
  if (what === 'bloom') bloomOn = !bloomOn;
  if (what === 'drift') driftOn = !driftOn;
  const btn = document.querySelector(`#hud [data-toggle="${what}"]`);
  if (btn) btn.classList.toggle('on', what === 'dom' ? domOn : what === 'bloom' ? bloomOn : driftOn);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
  setFraming(framing, true);
});

// ── loop ────────────────────────────────────────────────────────────────
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _quat = new THREE.Quaternion();
const _offset = new THREE.Vector3();

function placeCamera() {
  _euler.set(look.pitch, look.yaw, 0);
  _quat.setFromEuler(_euler);
  _offset.copy(screenNormal).applyQuaternion(_quat).multiplyScalar(rig.distance * look.zoom);
  camera.position.copy(rig.target).add(_offset);
  camera.lookAt(rig.target);
}

function tick() {
  requestAnimationFrame(tick);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();

  screenMock.update(t);

  if (rig.t < 1) {
    rig.t = Math.min(1, rig.t + dt / rig.dur);
    const e = easeInOut(rig.t);
    rig.target.lerpVectors(rig.from.target, rig.to.target, e);
    rig.distance = THREE.MathUtils.lerp(rig.from.distance, rig.to.distance, e);
  }

  const locked = framing === 'docked';
  const parallaxAmt = locked ? 0 : 0.055;
  const drift = driftOn && !locked ? Math.sin(t * 0.22) * 0.05 : 0;
  const targetYaw = look.yawTo + (pointer.dragging ? 0 : -pointer.x * parallaxAmt + drift);
  const targetPitch = look.pitchTo + (pointer.dragging ? 0 : pointer.y * parallaxAmt * 0.6);

  look.yaw += (targetYaw - look.yaw) * Math.min(1, dt * 4);
  look.pitch += (targetPitch - look.pitch) * Math.min(1, dt * 4);
  if (locked) {
    look.yawTo += (0 - look.yawTo) * Math.min(1, dt * 4);
    look.pitchTo += (0 - look.pitchTo) * Math.min(1, dt * 4);
  }

  placeCamera();
  updateDomRect();

  if (bloomOn) composer.render();
  else renderer.render(scene, camera);
}

tick();

// ── dev handles ─────────────────────────────────────────────────────────
function remap() {
  if (!screenMesh) return;
  glass = mapScreen(screenMesh, screenNormal, SCREEN_INSET);
  updateScreenLight();
  setFraming(framing, true);
}

window.GENO = {
  /**
   * Measure the real visible aperture instead of guessing it: map the screen
   * with zero inset, paint it flat magenta, render offscreen, and read back
   * where magenta actually survives the chassis occluding it.
   */
  calibrate() {
    if (!screenMesh) return null;
    const saved = {
      mat: screenMesh.material,
      inset: { ...SCREEN_INSET },
      framing,
      mode: screenMock.mode,
    };

    Object.assign(SCREEN_INSET, { l: 0, r: 0, t: 0, b: 0 });
    glass = mapScreen(screenMesh, screenNormal, SCREEN_INSET);
    setFraming('docked', true);
    look.yaw = look.pitch = look.yawTo = look.pitchTo = 0;
    look.zoom = 1;
    placeCamera();
    camera.updateMatrixWorld(true);

    screenMesh.material = new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false });
    screenLight.visible = false; // green spill would contaminate the magenta test

    const w = 1400;
    const h = Math.max(2, Math.round(w / camera.aspect));
    const rt = new THREE.WebGLRenderTarget(w, h);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);
    rt.dispose();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
    const rowL = new Int32Array(h).fill(-1);
    const rowR = new Int32Array(h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (buf[i] > 170 && buf[i + 1] < 90 && buf[i + 2] > 170) {
          n++;
          if (rowL[y] < 0) rowL[y] = x;
          rowR[y] = x;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // The aperture is a rounded rectangle. Measure the radius by how far the
    // first and last rows are pinched in relative to the straight middle.
    let radiusPx = 0;
    if (n) {
      const mid = Math.round((minY + maxY) / 2);
      const straightL = rowL[mid];
      const straightR = rowR[mid];
      const pinch = [
        rowL[minY] >= 0 ? rowL[minY] - straightL : 0,
        rowL[maxY] >= 0 ? rowL[maxY] - straightL : 0,
        rowR[minY] >= 0 ? straightR - rowR[minY] : 0,
        rowR[maxY] >= 0 ? straightR - rowR[maxY] : 0,
      ].filter((v) => v > 0);
      radiusPx = pinch.length ? pinch.reduce((a, b) => a + b, 0) / pinch.length : 0;
    }

    // readRenderTargetPixels is bottom-up, so project with y pointing up too
    const q = projectQuad(glass.corners, w, h, true);

    const result = n
      ? {
          pixels: n,
          l: (minX - q.minX) / q.w,
          r: (q.maxX - maxX) / q.w,
          b: (minY - q.minY) / q.h,
          t: (q.maxY - maxY) / q.h,
          radius: radiusPx / (maxX - minX), // as a fraction of aperture width
          radiusPx,
        }
      : { pixels: 0, error: 'no magenta found — screen fully occluded?' };

    screenMesh.material = saved.mat;
    Object.assign(SCREEN_INSET, saved.inset);
    glass = mapScreen(screenMesh, screenNormal, SCREEN_INSET);
    updateScreenLight();
    setFraming(saved.framing, true);
    screenMock.setMode(saved.mode);

    return result;
  },

  /** GENO.inset({l,r,t,b}) — fractions of the mesh hidden by the chassis. */
  inset(next) {
    if (next) Object.assign(SCREEN_INSET, next);
    remap();
    return { ...SCREEN_INSET };
  },

  /**
   * GENO.shape(radius, marginX, marginY) — corner radius of the aperture and
   * the safe margin the UI keeps from it, as fractions of aperture width.
   */
  shape(r, mX, mY) {
    if (r !== undefined) screenRadius = r;
    const s = screenMock.setShape(r, mX, mY);
    return { radius: screenRadius, marginX: s.marginX, marginY: s.marginY };
  },

  /** GENO.pad('docked', 1.3) — how much chassis shows around the glass. */
  pad(name, value) {
    if (FRAMINGS[name] && value !== undefined) {
      FRAMINGS[name].pad = value;
      setFraming(name, true);
    }
    return Object.fromEntries(Object.entries(FRAMINGS).map(([k, v]) => [k, v.pad]));
  },

  bloom(strength, radius, threshold) {
    if (strength !== undefined) bloom.strength = strength;
    if (radius !== undefined) bloom.radius = radius;
    if (threshold !== undefined) bloom.threshold = threshold;
    return { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold };
  },

  /**
   * Everything that makes the screen read as emitting light, in one place.
   *   GENO.glow({ spill: 4 })          brighter light thrown on the bezel
   *   GENO.glow({ haloAlpha: 0.32 })   wider halo around the glyphs
   *   GENO.glow({ emissive: 1.8 })     brighter glass overall
   */
  glow(next = {}) {
    if (next.spill !== undefined) SPILL.intensity = next.spill;
    if (next.spread !== undefined) SPILL.spread = next.spread;
    if (next.spill !== undefined || next.spread !== undefined) updateScreenLight();
    if (next.emissive !== undefined && screenMesh) screenMesh.material.emissiveIntensity = next.emissive;
    const g = screenMock.setGlow(next);
    return {
      spill: SPILL.intensity,
      spread: SPILL.spread,
      emissive: screenMesh?.material.emissiveIntensity,
      ...g,
      bloom: { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold },
    };
  },

  /** GENO.open('brief') or GENO.open('ML-3032') */
  open: (id) => screenMock.open(id),

  /** What is clickable at these viewport coords, if anything. */
  pick: (x, y) => pickScreen(x, y),

  /** True once the camera has settled — used by the screenshot harness. */
  settled: () => rig.t >= 1 && Math.abs(look.yaw) < 0.001 && Math.abs(look.pitch) < 0.001,
  state: () => ({
    framing,
    mode: screenMock.mode,
    distance: rig.distance,
    inset: { ...SCREEN_INSET },
    glass: glass && { w: glass.width, h: glass.height },
    domrect: projectQuad(glass ? glass.corners : [], window.innerWidth, window.innerHeight, false),
  }),
};
