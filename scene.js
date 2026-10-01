// The 3D bench: packages side by side at true relative scale, in mm.
//
// Each chip is built from a chip() object in model.js — die side, floorplan,
// contact count, decoupling capacitors, register width — so what you see is
// the model, drawn. Nothing here is sized by eye. The bench can be rebuilt at
// any time (the chip builder does this on every slider move), and a second
// bench shows real dies from real.js on a timeline.

import * as THREE from 'three';
import { ASSUME, part } from './model.js';
import { heatRGB } from './stress.js';
import { REAL, area as realArea, processLabel } from './real.js';

const BAR_Y = 15;              // height of the floating register
const BIT = 0.17, BIT_GAP = 0.05, BYTE_GAP = 0.14;
const BALL_R = 0.2;
const SUB_T = 1.0;             // substrate thickness
const DIE_T = 0.35;
const BLOCK_T = 0.06;
const GAP = 7;                 // mm between neighbouring slots

const SUB_Y = BALL_R * 2;
const DIE_Y = SUB_Y + SUB_T;
const BLOCK_Y = DIE_Y + DIE_T;
const LID_TOP = BLOCK_Y + BLOCK_T + 0.25 + 0.7;

const GROUP_TINT = {
  int: '#c4874a', mem: '#5f9c8b', ctl: '#8678ad', fp: '#8a9656', cache: '#5d7390', io: '#77706a',
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const barWidth = (bits) => bits * (BIT + BIT_GAP) + (bits / 8 - 1) * BYTE_GAP - BIT_GAP;

// --- Procedural die-shot textures ------------------------------------------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

const PATTERN = {};
const patternCache = new Map();
function cached(key, make) {
  if (!patternCache.has(key)) patternCache.set(key, make());
  return patternCache.get(key);
}

// SRAM arrays read as a fine, regular grid on a real die shot.
PATTERN.sram = (tint) => cached(`sram${tint}`, () => {
  const [c, g] = canvas(128, 128);
  g.fillStyle = shade(tint, -0.08); g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = (x + y) % 16 ? shade(tint, 0.06) : shade(tint, 0.0);
      g.fillRect(x + 1, y + 1, 6, 6);
    }
  }
  g.fillStyle = shade(tint, -0.2);
  g.fillRect(0, 62, 128, 4);
  return c;
});

// Synthesised logic reads as noise: thousands of standard cells, placed by tools.
PATTERN.logic = (tint, seed = 7) => cached(`logic${tint}${seed % 6}`, () => {
  const [c, g] = canvas(256, 256);
  const r = seeded(seed);
  g.fillStyle = shade(tint, -0.12); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = shade(tint, (r() - 0.5) * 0.22);
    g.fillRect(Math.floor(r() * 64) * 4, Math.floor(r() * 64) * 4, 4 + Math.floor(r() * 4) * 4, 4);
  }
  return c;
});

PATTERN.io = (tint) => cached(`io${tint}`, () => {
  const [c, g] = canvas(128, 128);
  g.fillStyle = shade(tint, -0.1); g.fillRect(0, 0, 128, 128);
  g.fillStyle = shade(tint, 0.12);
  for (let y = 4; y < 128; y += 16) for (let x = 4; x < 128; x += 16) g.fillRect(x, y, 9, 9);
  return c;
});

// The register file gets one stripe per bit so the width is visible on the die itself.
PATTERN.regs = (tint, bits) => cached(`regs${bits}`, () => {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = shade(tint, -0.16); g.fillRect(0, 0, 1024, 256);
  const col = 1024 / bits;
  for (let b = 0; b < bits; b++) {
    g.fillStyle = b % 8 === 0 ? shade(tint, 0.2) : shade(tint, b % 2 ? 0.02 : 0.1);
    g.fillRect(b * col + col * 0.12, 0, col * 0.76, 256);
  }
  g.fillStyle = shade(tint, -0.26);
  for (let r = 0; r < 256; r += 8) g.fillRect(0, r, 1024, 1.5);
  return c;
});

// A real die, drawn at the grain of its process: an 8 µm chip has features
// you could almost see; a 5 nm chip reads as fine, even texture.
PATTERN.real = (r) => cached(`real${r.id}`, () => {
  const [c, g] = canvas(512, 512);
  const rand = seeded(r.id.length * 977 + r.year);
  const era = r.year < 1990 ? '#a88d55' : r.year < 2008 ? '#6f7f93' : '#5e5490';
  g.fillStyle = shade(era, -0.18); g.fillRect(0, 0, 512, 512);
  const grain = Math.max(1, Math.round(2 + Math.log10(r.process) * 2.2));
  // A handful of macro blocks, then cells at the process grain.
  for (let i = 0; i < 9; i++) {
    const w = 60 + rand() * 180, h = 50 + rand() * 160;
    const x = 24 + rand() * (464 - w), y = 24 + rand() * (464 - h);
    g.fillStyle = shade(era, (rand() - 0.5) * 0.18);
    g.fillRect(x, y, w, h);
    if (rand() > 0.45) {
      g.fillStyle = shade(era, 0.1);
      for (let yy = y + 2; yy < y + h - 2; yy += grain * 2) for (let xx = x + 2; xx < x + w - 2; xx += grain * 2) g.fillRect(xx, yy, grain, grain);
    }
  }
  const cells = Math.min(14000, 2200 * grain);
  for (let i = 0; i < cells; i++) {
    g.fillStyle = shade(era, (rand() - 0.5) * 0.26);
    g.fillRect(Math.floor(rand() * 512 / grain) * grain, Math.floor(rand() * 512 / grain) * grain, grain * (1 + Math.floor(rand() * 3)), grain);
  }
  // Bond pads around the edge: chunky on old chips.
  const pad = r.year < 1995 ? 18 : 8;
  g.fillStyle = '#d8c58a';
  for (let p = 30; p < 482; p += pad * 1.8) {
    g.fillRect(p, 4, pad, pad); g.fillRect(p, 508 - pad, pad, pad);
    g.fillRect(4, p, pad, pad); g.fillRect(508 - pad, p, pad, pad);
  }
  return c;
});

// --- Floorplan --------------------------------------------------------------

function splitTreemap(items, x, z, w, d, out) {
  if (items.length === 1) { out.push({ ...items[0], x, z, w, d }); return; }
  const total = items.reduce((s, p) => s + p.area, 0);
  let acc = 0, k = 1, bestGap = Infinity;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].area;
    const gap = Math.abs(acc - total / 2);
    if (gap < bestGap) { bestGap = gap; k = i + 1; }
  }
  const a = items.slice(0, k), b = items.slice(k);
  const fa = a.reduce((s, p) => s + p.area, 0) / total;
  if (w >= d) {
    splitTreemap(a, x, z, w * fa, d, out);
    splitTreemap(b, x + w * fa, z, w * (1 - fa), d, out);
  } else {
    splitTreemap(a, x, z, w, d * fa, out);
    splitTreemap(b, x, z + d * fa, w, d * (1 - fa), out);
  }
}

// Left strip: memory controller, interconnect, I/O. Right: a row of cores,
// the L3, a second row of cores. Rows are sized by how many cores they hold,
// so every core keeps exactly its modelled area. Only the arrangement is a choice.
export function floorplan(c) {
  const S = c.dieSide, h = S / 2;
  const rects = [];
  const strip = c.uncore.filter((p) => p.id !== 'l3');
  const stripArea = strip.reduce((s, p) => s + p.area, 0);
  const stripW = stripArea / S;
  let z = -h;
  for (const p of strip) {
    const d = p.area / stripW;
    rects.push({ ...p, core: -1, x: -h, z, w: stripW, d });
    z += d;
  }
  const M = S - stripW, x0 = -h + stripW;
  const top = Math.ceil(c.cores / 2), bottom = c.cores - top;
  const topD = (top * c.coreArea) / M, botD = (bottom * c.coreArea) / M;
  const l3 = c.uncore.find((p) => p.id === 'l3');
  if (l3) rects.push({ ...l3, core: -1, x: x0, z: -h + topD, w: M, d: l3.area / M });
  let i = 0;
  for (const [count, rowZ, rowD, flip] of [[top, -h, topD, false], [bottom, h - botD, botD, true]]) {
    for (let k = 0; k < count; k++, i++) {
      const out = [];
      const cw = M / count;
      splitTreemap(c.core, 0, 0, cw, rowD, out);
      for (const r of out) {
        const zz = flip ? rowZ + rowD - r.z - r.d : rowZ + r.z;   // the second row mirrors, so L2s face the L3
        rects.push({ ...r, core: i, x: x0 + k * cw + r.x, z: zz });
      }
    }
  }
  return rects;
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
    if (o.isCSS2DObject) o.element.remove();
  });
  obj.removeFromParent();
}

// --- Scene ------------------------------------------------------------------

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const labels = new THREE.CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  container.appendChild(tip);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 3000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 520;
  controls.zoomToCursor = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-40, 90, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 60, bottom: -60, near: 10, far: 300 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Floor: catches shadows from above, disappears from below so the contacts stay visible.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const gridPts = [];
  for (let x = -200; x <= 200; x += 10) gridPts.push(x, 0, -50, x, 0, 50);
  for (let z = -50; z <= 50; z += 10) gridPts.push(-200, 0, z, 200, 0, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  grid.position.y = -0.01;
  scene.add(grid);

  function label(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return new THREE.CSS2DObject(el);
  }

  // A 10 mm ruler so "true scale" means something.
  const ruler = new THREE.Group();
  const rulerMat = new THREE.MeshBasicMaterial();
  ruler.add(new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 0.12), rulerMat));
  for (let i = 0; i <= 10; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, i % 5 ? 0.35 : 0.7), rulerMat);
    t.position.set(-5 + i, 0, -0.2);
    ruler.add(t);
  }
  const rulerLabel = label('ruler', '10 mm');
  rulerLabel.position.set(0, 0, 1.1);
  ruler.add(rulerLabel);
  scene.add(ruler);

  // --- State driven by the panel ---------------------------------------------

  const want = { lid: 0, explode: 0, bus: 1, power: 0, labels: 1, thermal: 0 };
  const now = { lid: 0, explode: 0 };
  let selected = null, hovered = null, selectedReal = null;
  let theme = {};
  let mode = 'lineup';
  let coolerType = 'stock';
  let thermal = new Map();      // key -> stress state
  const listeners = { pick: [] };

  // --- Chips ---------------------------------------------------------------

  const benchGroup = new THREE.Group();
  scene.add(benchGroup);
  const bench = new Map();      // key -> chip state
  let order = [];

  function signature(c) {
    return JSON.stringify([c.w, c.cfg.cores, c.cfg.l2KB, c.cfg.l3MB, c.cfg.clockGHz, c.cfg.node, c.cfg.name || '']);
  }

  function buildChip(c) {
    const root = new THREE.Group();
    benchGroup.add(root);
    const S = c.dieSide, P = c.pkgSide;
    const st = { c, key: c.key, sig: signature(c), root, racing: false, raceUntil: 0, bitsUsed: 0, value: 0n, flicker: 0, override: null, pickables: [] };
    const m = new THREE.Matrix4();

    // Contacts. Signals take the outer rings, power and ground the centre under the die.
    const n = c.grid;
    const cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      cells.push({ i, j, ring: Math.max(Math.abs(i - (n - 1) / 2), Math.abs(j - (n - 1) / 2)) });
    }
    const outer = [...cells].sort((a, b) => b.ring - a.ring || a.i - b.i || a.j - b.j);
    const inner = [...cells].sort((a, b) => a.ring - b.ring || a.i - b.i || a.j - b.j);
    const kinds = new Map();
    outer.slice(0, c.signalContacts).forEach((cell) => kinds.set(cell, 'sig'));
    let power = 0;
    for (const cell of inner) {
      if (power >= c.supplyContacts * 2) break;
      if (kinds.has(cell)) continue;
      kinds.set(cell, (cell.i + cell.j) % 2 ? 'gnd' : 'vdd');
      power++;
    }
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.28 }), kinds.size);
    const ballKinds = [];
    let k = 0;
    for (const [cell, kind] of kinds) {
      m.setPosition((cell.i - (n - 1) / 2) * ASSUME.ballPitch, BALL_R, (cell.j - (n - 1) / 2) * ASSUME.ballPitch);
      balls.setMatrixAt(k++, m);
      ballKinds.push(kind);
    }
    balls.castShadow = true;
    const ballLayer = new THREE.Group();
    ballLayer.add(balls);
    root.add(ballLayer);

    // Substrate.
    const subLayer = new THREE.Group();
    const sub = new THREE.Mesh(new THREE.RoundedBoxGeometry(P, SUB_T, P, 2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x2c4632, roughness: 0.62, metalness: 0.05 }));
    sub.position.y = SUB_Y + SUB_T / 2;
    sub.castShadow = sub.receiveShadow = true;
    sub.userData = { kind: 'substrate', key: c.key };
    subLayer.add(sub);

    // Decoupling capacitors: more current, more of them.
    const capBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.32, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x9c7d52, roughness: 0.55 }), c.decaps);
    const capEnd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.34, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.9, roughness: 0.3 }), c.decaps * 2);
    const ring = Math.min(S / 2 + 3.4, P / 2 - 0.8);
    const perSide = Math.ceil(c.decaps / 4);
    const up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let d = 0; d < c.decaps; d++) {
      const side = Math.floor(d / perSide), t = ((d % perSide) + 0.5) / perSide;
      const along = -ring + t * ring * 2;
      const pos = [[along, -ring], [ring, along], [-along, ring], [-ring, -along]][side];
      const q = new THREE.Quaternion().setFromAxisAngle(up, side % 2 ? Math.PI / 2 : 0);
      m.compose(new THREE.Vector3(pos[0], DIE_Y + 0.16, pos[1]), q, one);
      capBody.setMatrixAt(d, m);
      for (const e of [-1, 1]) {
        const off = new THREE.Vector3(e * 0.4, 0, 0).applyQuaternion(q);
        m.compose(new THREE.Vector3(pos[0] + off.x, DIE_Y + 0.16, pos[1] + off.z), q, one);
        capEnd.setMatrixAt(d * 2 + (e > 0 ? 1 : 0), m);
      }
    }
    capBody.castShadow = true;
    capBody.userData = { kind: 'decaps', key: c.key };
    subLayer.add(capBody, capEnd);
    root.add(subLayer);
    st.pickables.push(sub, capBody);

    // Die: silicon with a thin-film sheen.
    const dieLayer = new THREE.Group();
    const die = new THREE.Mesh(new THREE.BoxGeometry(S + 0.3, DIE_T, S + 0.3),
      new THREE.MeshPhysicalMaterial({
        color: 0x262c3a, metalness: 0.35, roughness: 0.32,
        iridescence: 0.7, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 520],
      }));
    die.position.y = DIE_Y + DIE_T / 2;
    die.castShadow = true;
    dieLayer.add(die);
    root.add(dieLayer);

    // Floorplan blocks.
    const blockLayer = new THREE.Group();
    const blocks = [];
    for (const r of floorplan(c)) {
      const tint = GROUP_TINT[r.group];
      let top;
      if (r.id === 'regs') top = tex(PATTERN.regs(GROUP_TINT.int, c.w));
      else if (r.group === 'cache') top = tex(PATTERN.sram(tint), r.w / 0.22, r.d / 0.22);
      else if (r.group === 'io') top = tex(PATTERN.io(tint), r.w / 0.5, r.d / 0.5);
      else top = tex(PATTERN.logic(tint, r.id.length * 31 + r.core), r.w / 0.9, r.d / 0.9);
      const sideMat = new THREE.MeshStandardMaterial({ color: shade(tint, -0.2), roughness: 0.5, metalness: 0.3 });
      const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.42, metalness: 0.35 });
      const gap = Math.min(0.025, r.w / 8, r.d / 8);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, r.w - gap * 2), BLOCK_T, Math.max(0.01, r.d - gap * 2)),
        [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      mesh.position.set(r.x + r.w / 2, BLOCK_Y + BLOCK_T / 2, r.z + r.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { kind: 'part', key: c.key, id: r.id, core: r.core, group: r.group, area: r.area, lift: r.group === 'int' ? 1 : 0, mats: [sideMat, topMat], glow: -1 };
      blockLayer.add(mesh);
      blocks.push(mesh);
      st.pickables.push(mesh);
    }
    root.add(blockLayer);

    // Heat spreader, with laser marking.
    const lidLayer = new THREE.Group();
    const L = Math.min(S + 5, P - 1);
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.34 });
    const lidTop = new THREE.Mesh(new THREE.RoundedBoxGeometry(L, 0.7, L, 3, 0.3), lidMat);
    lidTop.position.y = LID_TOP - 0.35;
    lidTop.castShadow = true;
    lidTop.userData = { kind: 'lid', key: c.key };
    const skirtH = lidTop.position.y - 0.35 - DIE_Y;
    for (const [sx, sz, w, d] of [[0, -L / 2 + 0.3, L, 0.6], [0, L / 2 - 0.3, L, 0.6], [-L / 2 + 0.3, 0, 0.6, L], [L / 2 - 0.3, 0, 0.6, L]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, skirtH, d), lidMat);
      wall.position.set(sx, DIE_Y + skirtH / 2, sz);
      wall.castShadow = true;
      lidLayer.add(wall);
    }
    const markMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.86, L * 0.86), markMat);
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = LID_TOP + 0.001;
    lidLayer.add(lidTop, mark);
    root.add(lidLayer);
    st.pickables.push(lidTop);
    st.mark = { mat: markMat, L };
    drawMarking(st);

    // The register, floating above, one cube per bit, MSB on the left.
    const bits = c.w;
    const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(BIT, 0.95, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bits);
    const width = barWidth(bits);
    const xs = [];
    for (let b = 0; b < bits; b++) {
      const fromLeft = bits - 1 - b;
      xs[b] = -width / 2 + fromLeft * (BIT + BIT_GAP) + Math.floor(fromLeft / 8) * BYTE_GAP + BIT / 2;
      m.setPosition(xs[b], BAR_Y, 0);
      bar.setMatrixAt(b, m);
    }
    bar.userData = { kind: 'bit', key: c.key };
    root.add(bar);
    st.pickables.push(bar);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.7 }));
    plate.position.set(0, BAR_Y - 0.56, 0);
    root.add(plate);

    // One lane per byte from register to die: 1, 2, 4, 8 or 16 bytes per load.
    const bytes = bits / 8;
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bytes * 6), 3));
    const laneMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
    const lanes = new THREE.LineSegments(laneGeo, laneMat);
    root.add(lanes);
    const PULSES = 3;
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), bytes * PULSES);
    root.add(pulses);
    st.lanes = {
      geo: laneGeo, mat: laneMat, mesh: lanes, pulses, bytes, PULSES,
      top: Array.from({ length: bytes }, (_, i) => (xs[i * 8] + xs[i * 8 + 7]) / 2),
      bottom: Array.from({ length: bytes }, (_, i) => (bytes === 1 ? 0 : (-S * 0.32) + (S * 0.64) * ((bytes - 1 - i) / (bytes - 1)))),
    };

    const head = label('tag', `<b>${esc(c.title)}</b><span>${esc(c.isa)} · ${c.area.toFixed(1)} mm² die${c.custom ? ` · ${c.cores}C ${c.clockGHz.toFixed(1)} GHz ${c.node.label}` : ''}</span>`);
    head.center.set(0.5, 1);
    head.position.set(0, BAR_Y + 1.1, 0);
    root.add(head);
    const note = label('bitnote', '');
    note.center.set(0.5, 0);
    note.position.set(0, BAR_Y - 1.0, 0);
    root.add(note);
    const stat = label('statnote', '');
    stat.center.set(0.5, 0);
    stat.position.set(0, BAR_Y - 1.0, 0);
    stat.element.hidden = true;
    root.add(stat);

    Object.assign(st, {
      ballLayer, subLayer, dieLayer, blockLayer, lidLayer, blocks, lidMat, bar, bitX: xs, balls, ballKinds,
      note: note.element, noteObj: note, stat: stat.element, statObj: stat, headObj: head, slot: Math.max(P, width) + GAP, coolerObj: null,
    });
    paintBalls(st);
    paintBits(st);
    if (theme.s) {
      st.lanes.mat.color.copy(seriesColor(st));
      st.lanes.pulses.material.color.copy(seriesColor(st));
    }
    return st;
  }

  function drawMarking(st) {
    const [cv, g] = canvas(512, 512);
    const ink = 'rgba(40,44,52,0.62)';
    g.fillStyle = ink;
    g.font = '700 54px "Archivo", system-ui, sans-serif';
    g.fillText(st.c.code, 40, 120, 432);
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(`${st.c.isa} · ${st.c.cores}C`, 40, 180);
    g.fillText(`${st.c.clockGHz.toFixed(1)} GHz · ${st.c.power.toFixed(0)} W`, 40, 222);
    g.fillText(`${st.c.node.label} · ${st.c.w}-BIT`, 40, 264);
    g.fillText('BIT WIDTH LAB · 2026', 40, 450);
    g.strokeStyle = ink; g.lineWidth = 3;
    g.beginPath(); g.arc(452, 452, 16, 0, Math.PI * 2); g.stroke();
    const t = tex(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    if (st.mark.mat.map) st.mark.mat.map.dispose();
    st.mark.mat.map = t;
    st.mark.mat.needsUpdate = true;
  }
  if (document.fonts) document.fonts.ready.then(() => bench.forEach(drawMarking));

  // --- Coolers (stylised; a real cooler would dwarf these packages) ----------

  function buildCooler(type, L) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.9, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 });
    const W = L + 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.6, W * 0.8), new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: 0.3 }));
    base.position.y = 0.3;
    g.add(base);
    const out = { group: g, fan: null, ring: null };
    if (type === 'liquid') {
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.36, W * 0.38, 2.2, 40), dark);
      pump.position.y = 1.7;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.3, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x0c0f14, metalness: 0.4, roughness: 0.2 }));
      cap.position.y = 2.86;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x3987e5 });
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(W * 0.33, 0.12, 8, 48), ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 2.9;
      g.add(pump, cap, ringMesh);
      for (const s of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * W * 0.2, 2.2, -W * 0.3), new THREE.Vector3(s * W * 0.25, 3.5, -W * 0.7),
          new THREE.Vector3(s * W * 0.3, 2.5, -W * 1.4), new THREE.Vector3(s * W * 0.35, 0.8, -W * 1.9),
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.45, 10), dark);
        tube.castShadow = true;
        g.add(tube);
      }
      out.ring = ringMat;
      return out;
    }
    const finH = type === 'tower' ? 8 : type === 'passive' ? 4 : 3;
    const fins = Math.round(W / 0.55);
    const finGeo = new THREE.BoxGeometry(0.16, finH, W * 0.92);
    for (let i = 0; i < fins; i++) {
      const fin = new THREE.Mesh(finGeo, metal);
      fin.position.set(-W / 2 + 0.3 + i * ((W - 0.6) / (fins - 1)), 0.6 + finH / 2, 0);
      fin.castShadow = true;
      g.add(fin);
    }
    if (type === 'stock' || type === 'tower') {
      const fan = new THREE.Group();
      const R = W * 0.44;
      const frame = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 8, 40), dark);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.28, R * 0.28, 0.5, 24), dark);
      hub.rotation.x = Math.PI / 2;
      const blades = new THREE.Group();
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, side: THREE.DoubleSide });
      for (let b = 0; b < 7; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(R * 0.66, R * 0.3, 0.06), bladeMat);
        blade.position.x = R * 0.55;
        blade.rotation.x = 0.5;
        const arm = new THREE.Group();
        arm.rotation.z = (b / 7) * Math.PI * 2;
        arm.add(blade);
        blades.add(arm);
      }
      fan.add(frame, hub, blades);
      if (type === 'tower') {
        fan.position.set(0, 0.6 + finH / 2, W * 0.5 + 0.4);
      } else {
        fan.rotation.x = -Math.PI / 2;
        fan.position.set(0, 0.6 + finH + 0.4, 0);
      }
      g.add(fan);
      out.fan = blades;
    }
    return out;
  }

  function setCooler(type) {
    coolerType = type;
    bench.forEach(fitCooler);
  }

  function fitCooler(st) {
    if (st.coolerObj) { dispose(st.coolerObj.group); st.coolerObj = null; }
    if (!coolerType || coolerType === 'none') return;
    st.coolerObj = buildCooler(coolerType, st.mark.L);
    st.coolerObj.group.position.y = LID_TOP;
    st.lidLayer.add(st.coolerObj.group);
  }

  // --- Bench layout ----------------------------------------------------------

  function setBench(list) {
    const keep = new Set(list.map((c) => c.key));
    for (const [key, st] of bench) {
      if (!keep.has(key)) { dispose(st.root); bench.delete(key); }
    }
    for (const c of list) {
      const old = bench.get(c.key);
      if (old && old.sig === signature(c)) { old.c = c; continue; }
      if (old) dispose(old.root);
      const st = buildChip(c);
      fitCooler(st);
      bench.set(c.key, st);
    }
    order = list.map((c) => c.key);
    layout();
  }

  let bounds = { min: -60, max: 60 };
  function layout() {
    const sts = order.map((k) => bench.get(k));
    const total = sts.reduce((s, st) => s + st.slot, 0);
    let x = -total / 2;
    for (const st of sts) {
      st.root.position.x = x + st.slot / 2;
      x += st.slot;
    }
    bounds = { min: -total / 2, max: total / 2 };
    const first = sts[0];
    if (first) ruler.position.set(first.root.position.x, 0.02, first.c.pkgSide / 2 + 5);
    sun.shadow.camera.left = Math.min(-130, bounds.min - 20);
    sun.shadow.camera.right = Math.max(130, bounds.max + 20);
    sun.shadow.camera.updateProjectionMatrix();
  }

  // --- Real chips bench --------------------------------------------------------

  const realGroup = new THREE.Group();
  realGroup.visible = false;
  scene.add(realGroup);
  const realDies = [];
  (function buildReal() {
    const sorted = [...REAL].sort((a, b) => a.year - b.year);
    const widths = sorted.map((r) => Math.max(r.die[0], 9) + 6);
    const total = widths.reduce((s, w) => s + w, 0);
    let x = -total / 2;
    const timeline = [];
    sorted.forEach((r, i) => {
      const [w, d] = r.die;
      const cx = x + widths[i] / 2;
      x += widths[i];
      const g = new THREE.Group();
      g.position.x = cx;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.3, d + 1.2), new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.2, roughness: 0.6 }));
      plate.position.y = 0.15;
      plate.receiveShadow = true;
      const top = tex(PATTERN.real(r));
      top.userData.shared = true;
      const side = new THREE.MeshPhysicalMaterial({ color: 0x2a2f3c, metalness: 0.4, roughness: 0.3, iridescence: 0.6, iridescenceIOR: 1.5 });
      const face = new THREE.MeshPhysicalMaterial({ map: top, metalness: 0.45, roughness: 0.35, iridescence: r.year > 2005 ? 0.5 : 0.15, iridescenceIOR: 1.5 });
      const die = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), [side, side, face, side, side, side]);
      die.position.y = 0.55;
      die.castShadow = true;
      die.userData = { kind: 'real', id: r.id, mats: [side, face] };
      const swatch = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.32, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      swatch.position.set(0, 0.16, (d + 1.2) / 2 + 0.25);
      swatch.userData = { bits: r.bits };
      const tag = label('tag realtag', `<b>${esc(r.short)}</b><span>${r.simd ? '128-bit SIMD' : `${r.bits}-bit`} · ${realArea(r).toFixed(r.die[0] < 2 ? 1 : 0)} mm²</span>`);
      tag.center.set(0.5, 1);
      tag.position.set(0, (i % 2 ? 12 : 6.5), -d / 2);
      g.add(plate, die, swatch, tag);
      realGroup.add(g);
      realDies.push({ r, group: g, die, swatch, tag });
      timeline.push(cx);
    });
    const line = new THREE.Mesh(new THREE.BoxGeometry(total, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0x888888 }));
    line.position.set(0, 0.03, 16);
    line.userData.timeline = true;
    realGroup.add(line);
    sorted.forEach((r, i) => {
      const t = label('ruler', `${r.year}<br><span class="dim">${processLabel(r.process)}</span>`);
      t.position.set(timeline[i], 0.05, 17.5);
      realGroup.add(t);
    });
    realGroup.userData = { total };
  })();

  // --- Theme -----------------------------------------------------------------

  function seriesColor(st) {
    return theme.s[st.key] || theme.s.custom;
  }

  function applyTheme() {
    const keys = ['8', '16', '32', '64', '128', 'custom'];
    theme = {
      bg: new THREE.Color(css('--scene') || '#11151b'),
      grid: new THREE.Color(css('--scene-grid') || '#2a313b'),
      ink: new THREE.Color(css('--ink') || '#e8eaed'),
      off: new THREE.Color(css('--bit-off') || '#2b313a'),
      s: Object.fromEntries(keys.map((k) => [k, new THREE.Color(css(`--s${k}`) || '#3987e5')])),
    };
    scene.background = theme.bg;
    gridMat.color.copy(theme.grid);
    rulerMat.color.copy(theme.ink);
    for (const st of bench.values()) {
      st.lanes.mat.color.copy(seriesColor(st));
      st.lanes.pulses.material.color.copy(seriesColor(st));
      paintBalls(st);
      paintBits(st);
    }
    for (const d of realDies) d.swatch.material.color.copy(theme.s[String(d.r.bits)]);
    realGroup.children.filter((o) => o.userData.timeline).forEach((o) => o.material.color.copy(theme.ink));
  }

  function paintBalls(st) {
    const silver = new THREE.Color('#d6d8db');
    const col = {
      sig: want.power ? new THREE.Color('#7d8189') : silver,
      vdd: want.power ? new THREE.Color('#e5484d') : silver,
      gnd: want.power ? new THREE.Color('#3b7dd8') : silver,
    };
    st.ballKinds.forEach((k, i) => st.balls.setColorAt(i, col[k]));
    st.balls.instanceColor.needsUpdate = true;
  }

  function paintBits(st) {
    if (!theme.s) return;
    const on = seriesColor(st), off = theme.off;
    for (let b = 0; b < st.c.w; b++) st.bar.setColorAt(b, (st.value >> BigInt(b)) & 1n ? on : off);
    st.bar.instanceColor.needsUpdate = true;
  }

  // Default register contents: the current Unix time. It needs 31 bits, which
  // is the point: the 8- and 16-bit registers cannot hold it at all, the
  // 32-bit one is one bit from full (19 January 2038, for signed time), and
  // the wider ones are mostly empty.
  function showClock() {
    const t = BigInt(Math.floor(Date.now() / 1000));
    const used = t.toString(2).length;
    for (const st of bench.values()) {
      if (st.racing || st.override) continue;
      const w = st.c.w;
      st.value = t & ((1n << BigInt(w)) - 1n);
      paintBits(st);
      st.note.innerHTML = w >= used
        ? `<b>${used}</b> of ${w} bits`
        : `needs <b>${Math.ceil(used / w)}</b> registers`;
    }
  }
  setInterval(showClock, 1000);

  // --- Camera --------------------------------------------------------------

  let tween = null;
  function fitAll() {
    const span = mode === 'real' ? realGroup.userData.total : bounds.max - bounds.min;
    const halfW = span / 2 + 6;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max(halfW / Math.tan(hfov / 2), 22 / Math.tan(vfov / 2)) * 1.02;
    const y = mode === 'real' ? 2 : 7;
    const cx = mode === 'real' ? 0 : (bounds.min + bounds.max) / 2;
    const dir = new THREE.Vector3(0, mode === 'real' ? 0.62 : 0.5, mode === 'real' ? 0.78 : 0.866);
    return { pos: dir.multiplyScalar(dist).add(new THREE.Vector3(cx, y, 2)), target: new THREE.Vector3(cx, y, 2) };
  }
  function view(name) {
    if (name === 'all' || mode === 'real' && !name.startsWith('real:')) return fitAll();
    if (name === 'under') {
      const v = fitAll();
      const d = v.pos.distanceTo(v.target);
      return { pos: new THREE.Vector3(v.target.x, -d * 0.55, d * 0.83), target: new THREE.Vector3(v.target.x, 0, 0) };
    }
    if (name.startsWith('real:')) {
      const d = realDies.find((x) => x.r.id === name.slice(5));
      if (!d) return fitAll();
      const x = d.group.position.x, s = Math.max(d.r.die[0], 4);
      return { pos: new THREE.Vector3(x + s * 0.2, s * 1.5 + 6, s * 1.8 + 8), target: new THREE.Vector3(x, 2.5, 0) };
    }
    const [kind, key] = name.includes(':') ? name.split(':') : ['top', name];
    const st = bench.get(key);
    if (!st) return fitAll();
    const x = st.root.position.x, s = st.c.dieSide;
    if (kind === 'die') return { pos: new THREE.Vector3(x + 0.27 * s, 1.7 * s, 1.5 * s), target: new THREE.Vector3(x, 1.6, 0.07 * s) };
    if (kind === 'under') return { pos: new THREE.Vector3(x + 2, -26, 18), target: new THREE.Vector3(x, 0, 0) };
    const far = Math.max(30, st.slot * 0.9);
    return { pos: new THREE.Vector3(x + 4, far, far * 1.2), target: new THREE.Vector3(x, 5, 0) };
  }
  function focus(name) {
    const v = view(name);
    if (reduceMotion.matches) {
      camera.position.copy(v.pos); controls.target.copy(v.target); controls.update();
      return;
    }
    tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: v.pos, toT: v.target, t0: performance.now(), dur: 1100 };
  }

  // 'timeline' hands the viewport to the timeline stage and stops drawing.
  // Coming back from it, the camera is only reset if the bench changed.
  let mode3d = 'lineup';
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    renderer.domElement.style.visibility = mode === 'timeline' ? 'hidden' : '';
    if (mode === 'timeline') return;
    benchGroup.visible = mode === 'lineup';
    realGroup.visible = mode === 'real';
    if (mode !== mode3d) { mode3d = mode; focus('all'); }
  }

  // --- Picking ---------------------------------------------------------------

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt = null;

  function hit(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    let list;
    if (mode === 'real') list = realDies.map((d) => d.die);
    else {
      list = [];
      for (const st of bench.values()) {
        for (const o of st.pickables) {
          if (o.userData.kind === 'lid' && now.lid < 0.5) continue;
          list.push(o);
        }
      }
    }
    return ray.intersectObjects(list, false)[0] || null;
  }

  function describe(h) {
    const u = h.object.userData;
    if (u.kind === 'real') {
      const r = REAL.find((x) => x.id === u.id);
      return `<b>${esc(r.name)} · ${r.year}</b><span>${realArea(r).toFixed(1)} mm² · ${processLabel(r.process)} · click for details</span>`;
    }
    const st = bench.get(u.key);
    if (!st) return null;
    const c = st.c;
    const th = thermal.get(u.key);
    if (u.kind === 'part') {
      const p = part(u.id);
      const where = u.core >= 0 ? `core ${u.core + 1}` : 'shared';
      const heat = want.thermal && th ? ` · ${th.partTemp(u.id).toFixed(0)} °C` : '';
      return `<b>${p.name}</b><span>${esc(c.title)} · ${where} · ${u.area.toFixed(2)} mm²${heat}</span>`;
    }
    if (u.kind === 'bit') {
      const b = h.instanceId;
      const v = (st.value >> BigInt(b)) & 1n;
      return `<b>Bit ${b}</b><span>${esc(c.title)} register · worth 2^${b} · currently ${v}</span>`;
    }
    if (u.kind === 'lid') return `<b>${coolerType && coolerType !== 'none' ? 'Heat spreader and cooler' : 'Heat spreader'}</b><span>${esc(c.title)} · ${c.power.toFixed(1)} W to carry away at full load</span>`;
    if (u.kind === 'decaps') return `<b>Decoupling capacitors</b><span>${esc(c.title)} · ${c.decaps} of them, smoothing ${c.current.toFixed(1)} A of supply current</span>`;
    if (u.kind === 'substrate') return `<b>Package substrate</b><span>${esc(c.title)} · ${c.pkgSide.toFixed(1)} mm square · ${c.contacts} contacts underneath</span>`;
    return null;
  }

  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;
    const h = hit(ev);
    const u = h ? h.object.userData : null;
    listeners.pick.forEach((f) => f(u));
  });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) { tip.hidden = true; return; }
    const h = hit(ev);
    const html = h && describe(h);
    const u = h && h.object.userData;
    hovered = u && (u.kind === 'part' || u.kind === 'real') ? u : null;
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const r = container.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    tip.style.left = `${Math.max(8, Math.min(x + 14, r.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, y - tip.offsetHeight - 12)}px`;
  });
  renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; hovered = null; });

  // --- Race --------------------------------------------------------------------

  let raceDone = null;
  function raceStart(rows, bitsUsed, onDone) {
    const ran = rows.filter((r) => !r.dnf);
    const fastest = Math.min(...ran.map((r) => r.s));
    const t0 = performance.now();
    const plan = [];
    for (const r of rows) {
      const st = bench.get(r.key);
      const ms = r.dnf ? 0 : Math.min(1600 * (r.s / fastest), 12000);
      plan.push({ key: r.key, ms });
      if (!st) continue;
      st.racing = !r.dnf;
      st.raceUntil = t0 + ms;
      st.bitsUsed = bitsUsed(st.c.w);
      st.finished = false;
      st.note.innerHTML = r.dnf ? 'Can’t run this job' : `${st.bitsUsed} of ${st.c.w} bits in use for this job`;
    }
    raceDone = onDone;
    if (!plan.some((p) => p.ms > 0)) setTimeout(() => { raceStop(); onDone && onDone(); }, 600);
    return plan;
  }
  function raceStop() {
    for (const st of bench.values()) { st.racing = false; st.finished = false; }
    showClock();
  }

  // --- Thermal view and register overrides ---------------------------------

  function setThermal(states) {
    thermal = new Map((states || []).map((s) => [s.key, s]));
    for (const st of bench.values()) st.stat.hidden = !thermal.has(st.key);
  }

  function setRegisters(values) {
    for (const st of bench.values()) {
      const v = values && values.get(st.key);
      st.override = v || null;
      if (v) {
        st.value = v.value & ((1n << BigInt(st.c.w)) - 1n);
        st.note.innerHTML = v.note;
        paintBits(st);
      }
    }
    if (!values) showClock();
  }

  // --- Frame loop --------------------------------------------------------------

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const tmp = new THREE.Matrix4();
  const hiCol = new THREE.Color();
  const heatCol = new THREE.Color();
  let last = performance.now();
  let rng = 0x9e3779b9;
  let statClock = 0;

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 7);
    now.lid += (want.lid - now.lid) * k;
    now.explode += (want.explode - now.explode) * k;

    if (tween) {
      const p = Math.min(1, (t - tween.t0) / tween.dur), e = ease(p);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (p >= 1) tween = null;
    }
    controls.update();

    const E = now.explode;
    const showStats = t - statClock > 120;
    if (showStats) statClock = t;
    for (const st of bench.values()) {
      st.ballLayer.position.y = -3.5 * E;
      st.dieLayer.position.y = 3.5 * E;
      st.blockLayer.position.y = 6.5 * E;
      for (const b of st.blocks) {
        const sel = selected && b.userData.id === selected ? 0.3 : 0;
        b.position.y = BLOCK_Y + BLOCK_T / 2 + b.userData.lift * 2.5 * E + sel;
      }
      // The lid fades while it lifts; it is only transparent mid-fade.
      const lid = now.lid > 0.995 ? 1 : now.lid;
      st.lidLayer.position.y = 10 * E + (1 - lid) * 5;
      st.lidMat.opacity = lid;
      st.mark.mat.opacity = lid;
      if (st.lidMat.transparent !== lid < 1) {
        st.lidMat.transparent = lid < 1;
        st.lidMat.depthWrite = lid >= 1;
        st.lidMat.needsUpdate = true;
      }
      st.lidLayer.visible = lid > 0.02;
      if (st.coolerObj) st.coolerObj.group.visible = lid > 0.98;

      const th = thermal.get(st.key);
      if (st.coolerObj) {
        const rpm = th ? th.rpm : 600;
        if (st.coolerObj.fan && !reduceMotion.matches) st.coolerObj.fan.rotation.z += (rpm / 60) * 0.25 * Math.PI * 2 * dt;
        if (st.coolerObj.ring) st.coolerObj.ring.color.setRGB(...(th ? heatRGB(th.hot) : heatRGB(30)));
      }
      if (th && showStats) {
        st.stat.innerHTML = th.tripped
          ? '<b>Shut down</b> · thermal trip'
          : th.dnf ? 'Idle · can’t run this job'
            : `<b>${th.hot.toFixed(0)} °C</b> · ${th.f.toFixed(2)} GHz · ${th.P.toFixed(1)} W`;
      }

      // Block colour: thermal camera, selection pulse, hover lift, race flicker.
      const running = st.racing && t < st.raceUntil;
      if (st.racing && t >= st.raceUntil && !st.finished) {
        st.finished = true;
        if ([...bench.values()].every((c) => !c.racing || c.finished)) {
          const cb = raceDone; raceDone = null;
          setTimeout(() => { raceStop(); cb && cb(); }, 900);
        }
      }
      for (const b of st.blocks) {
        const u = b.userData;
        let g = 0;
        hiCol.copy(theme.ink);
        const heat = !!(want.thermal && th);
        if (heat !== !!u.heat) {
          // A thermal camera sees heat, not the die pattern: darken the base colour.
          u.mats[1].color.set(heat ? 0x1a1a1a : 0xffffff);
          u.mats[0].color.set(heat ? 0x111111 : shade(GROUP_TINT[u.group], -0.2));
          u.heat = heat;
        }
        if (heat) {
          heatCol.setRGB(...heatRGB(th.partTemp(u.id)));
          hiCol.copy(heatCol);
          g = 0.62;
        }
        if (selected && u.id === selected) { g = Math.max(g, 0.6 + 0.3 * Math.sin(t / 260)); if (!(want.thermal && th)) hiCol.copy(seriesColor(st)); }
        else if (hovered && hovered.key === u.key && hovered.id === u.id && hovered.core === u.core) g = Math.max(g, 0.25);
        if (running && u.core >= 0 && !(want.thermal && th)) { g = Math.max(g, 0.25 + 0.25 * Math.random()); hiCol.copy(seriesColor(st)); }
        if (g || u.glow) {
          for (const mat of u.mats) { mat.emissive.copy(hiCol); mat.emissiveIntensity = g; }
          u.glow = g;
        }
      }

      // Register flicker while racing: only the bits the job actually uses move.
      if (running && !reduceMotion.matches && t - st.flicker > 60) {
        st.flicker = t;
        let v = 0n;
        for (let i = 0; i < st.bitsUsed; i += 16) {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          v |= BigInt(rng & 0xffff) << BigInt(i);
        }
        st.value = v & ((1n << BigInt(st.bitsUsed)) - 1n);
        paintBits(st);
      }

      // Byte lanes and the pulses riding them.
      const Ln = st.lanes;
      Ln.mesh.visible = Ln.pulses.visible = !!want.bus;
      if (want.bus) {
        const pos = Ln.geo.attributes.position.array;
        const yBottom = BLOCK_Y + BLOCK_T + 6.5 * E;
        for (let i = 0; i < Ln.bytes; i++) pos.set([Ln.top[i], BAR_Y - 0.6, 0, Ln.bottom[i], yBottom, 0.6], i * 6);
        Ln.geo.attributes.position.needsUpdate = true;
        const busy = running || (th && !th.tripped && !th.dnf) || st.override;
        const speed = busy ? 1.6 : 0.35;
        for (let i = 0; i < Ln.bytes; i++) {
          for (let p = 0; p < Ln.PULSES; p++) {
            const ph = reduceMotion.matches ? (p + 0.5) / Ln.PULSES : ((t / 1000) * speed + p / Ln.PULSES + i * 0.037) % 1;
            tmp.setPosition(Ln.top[i] + (Ln.bottom[i] - Ln.top[i]) * ph, BAR_Y - 0.6 + (yBottom - (BAR_Y - 0.6)) * ph, 0.6 * ph);
            Ln.pulses.setMatrixAt(i * Ln.PULSES + p, tmp);
          }
        }
        Ln.pulses.instanceMatrix.needsUpdate = true;
      }
      st.noteObj.visible = !!want.labels && !thermal.has(st.key);
      st.statObj.visible = !!want.labels && thermal.has(st.key);
    }

    for (const d of realDies) {
      const on = (selectedReal === d.r.id) || (hovered && hovered.kind === 'real' && hovered.id === d.r.id);
      const g = selectedReal === d.r.id ? 0.18 + 0.1 * Math.sin(t / 260) : on ? 0.15 : 0;
      for (const mat of d.die.userData.mats) { mat.emissive.copy(theme.ink); mat.emissiveIntensity = g; }
    }

    ruler.visible = !!want.labels && camera.position.y > 0 && mode === 'lineup';
    labels.domElement.hidden = !want.labels || mode === 'timeline';

    if (mode !== 'timeline') {
      renderer.render(scene, camera);
      labels.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  let started = false;
  return {
    setBench(list) {
      setBench(list);
      showClock();
      if (!started) {
        started = true;
        const v = fitAll();
        camera.position.copy(v.pos);
        controls.target.copy(v.target);
        requestAnimationFrame(frame);
      }
    },
    set(key, value) {
      want[key] = value ? 1 : 0;
      if (key === 'power') bench.forEach(paintBalls);
    },
    get: (key) => !!want[key],
    focus,
    setMode,
    get mode() { return mode; },
    select(id) { selected = id; },
    selectReal(id, { fly = true } = {}) { selectedReal = id; if (id && fly) focus(`real:${id}`); },
    setCooler,
    setThermal,
    setRegisters,
    raceStart,
    raceStop,
    onPick(f) { listeners.pick.push(f); },
    keys: () => [...order],
    debug: { bench, camera, renderer, scene, realDies },
  };
}
