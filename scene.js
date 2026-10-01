// The 3D view: three packages side by side at true relative scale, in mm.
//
// Each chip is built from CHIPS[w] in model.js — die side, floorplan, contact
// count, decoupling capacitors, register width — so what you see is the model,
// drawn. Nothing here is sized by eye.

import * as THREE from 'three';
import { CHIPS, WIDTHS, ASSUME, part } from './model.js';

const SPACING = 30;            // mm between package centres
const BAR_Y = 15;              // height of the floating register
const BIT = 0.17, BIT_GAP = 0.05, BYTE_GAP = 0.14;
const BALL_R = 0.2;
const SUB_T = 1.0;             // substrate thickness
const DIE_T = 0.35;
const BLOCK_T = 0.06;

const SUB_Y = BALL_R * 2;      // substrate bottom
const DIE_Y = SUB_Y + SUB_T;   // die bottom
const BLOCK_Y = DIE_Y + DIE_T; // floorplan blocks sit here

const GROUP_TINT = {
  int: '#c4874a', mem: '#5f9c8b', ctl: '#8678ad', fp: '#8a9656', cache: '#5d7390', io: '#77706a',
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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

// SRAM arrays read as a fine, regular grid on a real die shot.
PATTERN.sram = (tint) => {
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
};

// Synthesised logic reads as noise: thousands of standard cells, placed by tools.
PATTERN.logic = (tint, seed = 7) => {
  const [c, g] = canvas(256, 256);
  const r = seeded(seed);
  g.fillStyle = shade(tint, -0.12); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = shade(tint, (r() - 0.5) * 0.22);
    g.fillRect(Math.floor(r() * 64) * 4, Math.floor(r() * 64) * 4, 4 + Math.floor(r() * 4) * 4, 4);
  }
  return c;
};

// I/O and PHY: rows of pads.
PATTERN.io = (tint) => {
  const [c, g] = canvas(128, 128);
  g.fillStyle = shade(tint, -0.1); g.fillRect(0, 0, 128, 128);
  g.fillStyle = shade(tint, 0.12);
  for (let y = 4; y < 128; y += 16) for (let x = 4; x < 128; x += 16) g.fillRect(x, y, 9, 9);
  return c;
};

// The register file gets one stripe per bit so the width is visible on the die itself.
PATTERN.regs = (tint, bits) => {
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
};

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

// Left strip: memory controller, interconnect, I/O. Right: two cores, L3, two cores.
// Areas are exact; only the arrangement is a choice.
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
  const rowD = (2 * c.coreArea) / M;
  const l3 = c.uncore.find((p) => p.id === 'l3');
  const l3D = l3.area / M;
  rects.push({ ...l3, core: -1, x: x0, z: -h + rowD, w: M, d: l3D });
  for (let i = 0; i < 4; i++) {
    const top = i < 2;
    const out = [];
    splitTreemap(c.core, 0, 0, M / 2, rowD, out);
    for (const r of out) {
      const zz = top ? -h + r.z : h - r.z - r.d;     // bottom row mirrors so L2s face the L3
      rects.push({ ...r, core: i, x: x0 + (i % 2) * (M / 2) + r.x, z: zz });
    }
  }
  return rects;
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

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 320;
  controls.zoomToCursor = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-40, 90, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 50, bottom: -50, near: 10, far: 250 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Floor: catches shadows from above, disappears from below so the contacts stay visible.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const gridPts = [];
  for (let x = -100; x <= 100; x += 10) gridPts.push(x, 0, -40, x, 0, 40);
  for (let z = -40; z <= 40; z += 10) gridPts.push(-100, 0, z, 100, 0, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  grid.position.y = -0.01;
  scene.add(grid);

  // A 10 mm ruler so "true scale" means something.
  const ruler = new THREE.Group();
  const rulerMat = new THREE.MeshBasicMaterial();
  const rulerBar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 0.12), rulerMat);
  ruler.add(rulerBar);
  for (let i = 0; i <= 10; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, i % 5 ? 0.35 : 0.7), rulerMat);
    t.position.set(-5 + i, 0, -0.2);
    ruler.add(t);
  }
  const rulerLabel = label('ruler', '10 mm');
  rulerLabel.position.set(0, 0, 1.1);
  ruler.add(rulerLabel);
  ruler.position.set(-SPACING, 0.02, 17);
  scene.add(ruler);

  function label(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return new THREE.CSS2DObject(el);
  }

  // --- Chips ---------------------------------------------------------------

  const blockMeshes = [];
  const pickables = [];
  const chips = WIDTHS.map((w, i) => buildChip(CHIPS[w], (i - 1) * SPACING));

  function buildChip(c, x0) {
    const root = new THREE.Group();
    root.position.x = x0;
    scene.add(root);
    const S = c.dieSide, P = c.pkgSide;
    const state = { c, x0, root, racing: false, raceUntil: 0, bitsUsed: 0, value: 0n, flicker: 0 };

    // Contacts. Signals take the outer rings, power and ground the centre under the die.
    const n = c.grid;
    const cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const ring = Math.max(Math.abs(i - (n - 1) / 2), Math.abs(j - (n - 1) / 2));
      cells.push({ i, j, ring });
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
    const ballGeo = new THREE.SphereGeometry(BALL_R, 14, 10);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.28 });
    const balls = new THREE.InstancedMesh(ballGeo, ballMat, kinds.size);
    const ballKinds = [];
    const m = new THREE.Matrix4();
    let k = 0;
    for (const [cell, kind] of kinds) {
      m.setPosition((cell.i - (n - 1) / 2) * ASSUME.ballPitch, BALL_R, (cell.j - (n - 1) / 2) * ASSUME.ballPitch);
      balls.setMatrixAt(k, m);
      ballKinds.push(kind);
      k++;
    }
    balls.castShadow = true;
    balls.userData = { kind: 'balls', w: c.w, ballKinds };
    const ballLayer = new THREE.Group();
    ballLayer.add(balls);
    root.add(ballLayer);
    state.balls = balls;
    state.ballKinds = ballKinds;

    // Substrate with solder-mask green and a gold edge ring.
    const subLayer = new THREE.Group();
    const sub = new THREE.Mesh(
      new THREE.RoundedBoxGeometry(P, SUB_T, P, 2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x2c4632, roughness: 0.62, metalness: 0.05 }),
    );
    sub.position.y = SUB_Y + SUB_T / 2;
    sub.castShadow = sub.receiveShadow = true;
    sub.userData = { kind: 'substrate', w: c.w };
    subLayer.add(sub);

    // Decoupling capacitors: more current, more of them.
    const capBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.32, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x9c7d52, roughness: 0.55 }), c.decaps);
    const capEnd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.34, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.9, roughness: 0.3 }), c.decaps * 2);
    const ring = S / 2 + 3.4;
    const perSide = Math.ceil(c.decaps / 4);
    for (let d = 0; d < c.decaps; d++) {
      const side = Math.floor(d / perSide), t = ((d % perSide) + 0.5) / perSide;
      const along = -ring + t * ring * 2;
      const pos = [[along, -ring], [ring, along], [-along, ring], [-ring, -along]][side];
      const rot = side % 2 ? Math.PI / 2 : 0;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(pos[0], DIE_Y + 0.16, pos[1]), q, new THREE.Vector3(1, 1, 1));
      capBody.setMatrixAt(d, m);
      for (const e of [-1, 1]) {
        const off = new THREE.Vector3(e * 0.4, 0, 0).applyQuaternion(q);
        m.compose(new THREE.Vector3(pos[0] + off.x, DIE_Y + 0.16, pos[1] + off.z), q, new THREE.Vector3(1, 1, 1));
        capEnd.setMatrixAt(d * 2 + (e > 0 ? 1 : 0), m);
      }
    }
    capBody.castShadow = true;
    capBody.userData = { kind: 'decaps', w: c.w };
    subLayer.add(capBody, capEnd);
    root.add(subLayer);
    pickables.push(sub, capBody);

    // Die: silicon with a thin-film sheen.
    const dieLayer = new THREE.Group();
    const die = new THREE.Mesh(
      new THREE.BoxGeometry(S + 0.3, DIE_T, S + 0.3),
      new THREE.MeshPhysicalMaterial({
        color: 0x262c3a, metalness: 0.35, roughness: 0.32,
        iridescence: 0.7, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 520],
      }),
    );
    die.position.y = DIE_Y + DIE_T / 2;
    die.castShadow = true;
    dieLayer.add(die);
    root.add(dieLayer);

    // Floorplan blocks.
    const blockLayer = new THREE.Group();
    const regsTex = PATTERN.regs(GROUP_TINT.int, c.w);
    const blocks = [];
    for (const r of floorplan(c)) {
      const tint = GROUP_TINT[r.group];
      let top;
      if (r.id === 'regs') top = tex(regsTex);
      else if (r.group === 'cache') top = tex(PATTERN.sram(tint), r.w / 0.22, r.d / 0.22);
      else if (r.group === 'io') top = tex(PATTERN.io(tint), r.w / 0.5, r.d / 0.5);
      else top = tex(PATTERN.logic(tint, r.id.length * 31 + r.core), r.w / 0.9, r.d / 0.9);
      const sideMat = new THREE.MeshStandardMaterial({ color: shade(tint, -0.2), roughness: 0.5, metalness: 0.3 });
      const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.42, metalness: 0.35 });
      const gap = 0.025;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.w - gap * 2, BLOCK_T, r.d - gap * 2),
        [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      mesh.position.set(r.x + r.w / 2, BLOCK_Y + BLOCK_T / 2, r.z + r.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { kind: 'part', w: c.w, id: r.id, core: r.core, group: r.group, area: r.area, lift: r.group === 'int' ? 1 : 0, mats: [sideMat, topMat], glow: 0 };
      blockLayer.add(mesh);
      blocks.push(mesh);
      blockMeshes.push(mesh);
      pickables.push(mesh);
    }
    root.add(blockLayer);

    // Heat spreader, with laser marking.
    const lidLayer = new THREE.Group();
    const L = S + 5;
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.34 });
    const lidTop = new THREE.Mesh(new THREE.RoundedBoxGeometry(L, 0.7, L, 3, 0.3), lidMat);
    lidTop.position.y = BLOCK_Y + BLOCK_T + 0.25 + 0.35;
    lidTop.castShadow = true;
    lidTop.userData = { kind: 'lid', w: c.w };
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
    mark.position.y = lidTop.position.y + 0.351;
    lidLayer.add(lidTop, mark);
    root.add(lidLayer);
    pickables.push(lidTop);
    state.mark = { mat: markMat, L };
    drawMarking(state);

    // The register, floating above, one cube per bit, MSB on the left.
    const bits = c.w;
    const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(BIT, 0.95, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bits);
    const xs = [];
    const width = bits * (BIT + BIT_GAP) + (bits / 8 - 1) * BYTE_GAP - BIT_GAP;
    for (let b = 0; b < bits; b++) {
      const fromLeft = bits - 1 - b;
      const x = -width / 2 + fromLeft * (BIT + BIT_GAP) + Math.floor(fromLeft / 8) * BYTE_GAP + BIT / 2;
      xs[b] = x;
      m.setPosition(x, BAR_Y, 0);
      bar.setMatrixAt(b, m);
    }
    bar.userData = { kind: 'bit', w: c.w };
    root.add(bar);
    pickables.push(bar);
    state.bar = bar;
    state.bitX = xs;

    const plate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.7 }));
    plate.position.set(0, BAR_Y - 0.56, 0);
    root.add(plate);

    // One lane per byte from register to die: 4, 8 or 16 bytes per load.
    const bytes = bits / 8;
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bytes * 6), 3));
    const laneMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
    const lanes = new THREE.LineSegments(laneGeo, laneMat);
    root.add(lanes);
    const PULSES = 3;
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), bytes * PULSES);
    root.add(pulses);
    state.lanes = { geo: laneGeo, mat: laneMat, mesh: lanes, pulses, bytes, PULSES,
      top: Array.from({ length: bytes }, (_, i) => (xs[i * 8] + xs[i * 8 + 7]) / 2),
      bottom: Array.from({ length: bytes }, (_, i) => (-S * 0.32) + (S * 0.64) * ((bytes - 1 - i) / Math.max(1, bytes - 1))) };

    const head = label('tag', `<b>${c.short}</b><span>${c.isa} · ${c.area.toFixed(1)} mm² die</span>`);
    head.center.set(0.5, 1);
    head.position.set(0, BAR_Y + 1.1, 0);
    root.add(head);
    const note = label('bitnote', '');
    note.center.set(0.5, 0);
    note.position.set(0, BAR_Y - 1.0, 0);
    root.add(note);
    state.note = note.element;

    Object.assign(state, { ballLayer, subLayer, dieLayer, blockLayer, lidLayer, blocks, lidMat, plate, bitsLabel: note });
    return state;
  }

  function drawMarking(st) {
    const [cv, g] = canvas(512, 512);
    const ink = 'rgba(40,44,52,0.62)';
    g.fillStyle = ink;
    g.font = '700 54px "Archivo", system-ui, sans-serif';
    g.fillText(st.c.code, 40, 120);
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(`${st.c.isa} · 4C`, 40, 180);
    g.fillText(`${ASSUME.clockGHz.toFixed(1)} GHz · ${st.c.power.toFixed(0)} W`, 40, 222);
    g.fillText('BIT WIDTH LAB · 2026', 40, 450);
    g.strokeStyle = ink; g.lineWidth = 3;
    g.beginPath(); g.arc(452, 452, 16, 0, Math.PI * 2); g.stroke();
    const t = tex(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    if (st.mark.mat.map) st.mark.mat.map.dispose();
    st.mark.mat.map = t;
    st.mark.mat.needsUpdate = true;
  }
  if (document.fonts) document.fonts.ready.then(() => chips.forEach(drawMarking));

  // --- State driven by the panel ---------------------------------------------

  const want = { lid: 0, explode: 0, bus: 1, power: 0, labels: 1 };
  const now = { lid: 0, explode: 0 };
  let selected = null, hovered = null;
  let theme = {};

  function applyTheme() {
    theme = {
      bg: new THREE.Color(css('--scene') || '#11151b'),
      grid: new THREE.Color(css('--scene-grid') || '#2a313b'),
      ink: new THREE.Color(css('--ink') || '#e8eaed'),
      off: new THREE.Color(css('--bit-off') || '#2b313a'),
      s: Object.fromEntries(WIDTHS.map((w) => [w, new THREE.Color(css(`--s${w}`) || '#3987e5')])),
    };
    scene.background = theme.bg;
    gridMat.color.copy(theme.grid);
    rulerMat.color.copy(theme.ink);
    for (const st of chips) {
      st.lanes.mat.color.copy(theme.s[st.c.w]);
      st.lanes.pulses.material.color.copy(theme.s[st.c.w]);
      paintBalls(st);
      paintBits(st);
    }
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
    const on = theme.s[st.c.w], off = theme.off;
    for (let b = 0; b < st.c.w; b++) {
      const lit = (st.value >> BigInt(b)) & 1n;
      st.bar.setColorAt(b, lit ? on : off);
    }
    st.bar.instanceColor.needsUpdate = true;
  }

  // Default register contents: the current Unix time. It needs 31 bits, which is
  // the whole point — the 32-bit register is one bit from full (19 January 2038,
  // for signed time) and the wider ones are mostly empty.
  function showClock() {
    const t = BigInt(Math.floor(Date.now() / 1000));
    for (const st of chips) {
      if (st.racing) continue;
      st.value = t & ((1n << BigInt(st.c.w)) - 1n);
      paintBits(st);
      const used = t.toString(2).length;
      st.note.innerHTML = `Unix time <b>${t.toLocaleString('en-US')}</b> · ${used} of ${st.c.w} bits used`;
    }
  }
  applyTheme();
  showClock();
  setInterval(showClock, 1000);

  // --- Camera --------------------------------------------------------------

  let tween = null;
  const VIEWS = {
    all: () => fitAll(),
    under: () => {
      const v = fitAll();
      const d = v.pos.distanceTo(v.target);
      return { pos: new THREE.Vector3(0, -d * 0.55, d * 0.83), target: new THREE.Vector3(0, 0, 0) };
    },
  };
  for (const [i, w] of WIDTHS.entries()) {
    const x = (i - 1) * SPACING;
    VIEWS[w] = () => ({ pos: new THREE.Vector3(x + 4, 30, 36), target: new THREE.Vector3(x, 5, 0) });
    VIEWS[`die${w}`] = () => ({ pos: new THREE.Vector3(x + 1.5, 9.5, 8.5), target: new THREE.Vector3(x, 1.6, 0.4) });
    VIEWS[`under${w}`] = () => ({ pos: new THREE.Vector3(x + 2, -26, 18), target: new THREE.Vector3(x, 0, 0) });
  }
  function fitAll() {
    const halfW = SPACING + 17;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max(halfW / Math.tan(hfov / 2), 22 / Math.tan(vfov / 2)) * 1.02;
    const dir = new THREE.Vector3(0, 0.5, 0.866);
    return { pos: dir.multiplyScalar(dist).add(new THREE.Vector3(0, 7, 2)), target: new THREE.Vector3(0, 7, 2) };
  }
  function focus(name) {
    const v = (VIEWS[name] || VIEWS.all)();
    if (reduceMotion.matches) {
      camera.position.copy(v.pos); controls.target.copy(v.target); controls.update();
      return;
    }
    tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: v.pos, toT: v.target, t0: performance.now(), dur: 1100 };
  }

  // --- Picking ---------------------------------------------------------------

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt = null;
  const listeners = { pick: [], hover: [] };

  function hit(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const visible = pickables.filter((o) => o.visible && isShown(o));
    const hits = ray.intersectObjects(visible, false);
    return hits[0] || null;
  }
  function isShown(o) {
    if (o.userData.kind === 'lid') return now.lid > 0.5;
    return true;
  }

  function describe(h) {
    const u = h.object.userData;
    const c = CHIPS[u.w];
    if (u.kind === 'part') {
      const p = part(u.id);
      const where = u.core >= 0 ? `core ${u.core + 1}` : 'shared';
      return `<b>${p.name}</b><span>${c.short} · ${where} · ${u.area.toFixed(2)} mm²</span>`;
    }
    if (u.kind === 'bit') {
      const b = h.instanceId;
      const st = chips[WIDTHS.indexOf(u.w)];
      const v = (st.value >> BigInt(b)) & 1n;
      return `<b>Bit ${b}</b><span>${c.short} register · worth 2^${b} · currently ${v}</span>`;
    }
    if (u.kind === 'lid') return `<b>Heat spreader</b><span>${c.short} · ${c.power.toFixed(1)} W to carry away at full load</span>`;
    if (u.kind === 'decaps') return `<b>Decoupling capacitors</b><span>${c.short} · ${c.decaps} of them, smoothing ${c.current.toFixed(1)} A of supply current</span>`;
    if (u.kind === 'substrate') return `<b>Package substrate</b><span>${c.short} · ${c.pkgSide.toFixed(1)} mm square · ${c.contacts} contacts underneath</span>`;
    return null;
  }

  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;
    const h = hit(ev);
    const u = h && h.object.userData;
    listeners.pick.forEach((f) => f(u && u.kind === 'part' ? u.id : null, u));
  });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) { tip.hidden = true; return; }
    const h = hit(ev);
    const html = h && describe(h);
    hovered = h && h.object.userData.kind === 'part' ? h.object.userData : null;
    renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const r = container.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    tip.style.left = `${Math.min(x + 14, r.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.max(8, y - tip.offsetHeight - 12)}px`;
  });
  renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; hovered = null; });

  // --- Race --------------------------------------------------------------------

  function raceStart(rows, bitsUsed, onDone) {
    const fastest = Math.min(...rows.map((r) => r.s));
    const t0 = performance.now();
    const base = 1600;
    for (const st of chips) {
      const r = rows.find((x) => x.w === st.c.w);
      st.racing = true;
      st.raceUntil = t0 + Math.min(base * (r.s / fastest), 12000);
      st.bitsUsed = bitsUsed(st.c.w);
      st.note.innerHTML = `${st.bitsUsed} of ${st.c.w} bits in use for this job`;
    }
    raceDone = onDone;
    return chips.map((st) => ({ w: st.c.w, ms: st.raceUntil - t0 }));
  }
  let raceDone = null;
  function raceStop() {
    for (const st of chips) st.racing = false;
    showClock();
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
  const first = fitAll();
  camera.position.copy(first.pos);
  controls.target.copy(first.target);

  const tmp = new THREE.Matrix4();
  const hiCol = new THREE.Color();
  let last = performance.now();
  let rng = 0x9e3779b9;

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
    for (const st of chips) {
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

      // Glow: selection pulses, hover lifts, a racing chip's cores flicker.
      const running = st.racing && t < st.raceUntil;
      if (st.racing && t >= st.raceUntil && !st.finished) {
        st.finished = true;
        if (chips.every((c) => !c.racing || t >= c.raceUntil)) {
          const cb = raceDone; raceDone = null;
          setTimeout(() => { raceStop(); chips.forEach((c) => (c.finished = false)); cb && cb(); }, 900);
        }
      }
      for (const b of st.blocks) {
        const u = b.userData;
        let g = 0;
        hiCol.copy(theme.ink);
        if (selected && u.id === selected) { g = 0.6 + 0.3 * Math.sin(t / 260); hiCol.copy(theme.s[st.c.w]); }
        else if (hovered && hovered.id === u.id && hovered.w === u.w && hovered.core === u.core) g = 0.25;
        if (running && u.core >= 0) { g = Math.max(g, 0.25 + 0.25 * Math.random()); hiCol.copy(theme.s[st.c.w]); }
        if (Math.abs(g - u.glow) > 0.005 || g) {
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
      const L = st.lanes;
      L.mesh.visible = L.pulses.visible = !!want.bus;
      if (want.bus) {
        const pos = L.geo.attributes.position.array;
        const yBottom = BLOCK_Y + BLOCK_T + 6.5 * E;
        for (let i = 0; i < L.bytes; i++) {
          pos.set([L.top[i], BAR_Y - 0.6, 0, L.bottom[i], yBottom, 0.6], i * 6);
        }
        L.geo.attributes.position.needsUpdate = true;
        const speed = running ? 1.6 : 0.35;
        for (let i = 0; i < L.bytes; i++) {
          for (let p = 0; p < L.PULSES; p++) {
            const ph = reduceMotion.matches ? (p + 0.5) / L.PULSES : ((t / 1000) * speed + p / L.PULSES + i * 0.037) % 1;
            tmp.setPosition(
              L.top[i] + (L.bottom[i] - L.top[i]) * ph,
              BAR_Y - 0.6 + (yBottom - (BAR_Y - 0.6)) * ph,
              0.6 * ph,
            );
            L.pulses.setMatrixAt(i * L.PULSES + p, tmp);
          }
        }
        L.pulses.instanceMatrix.needsUpdate = true;
      }
      st.bitsLabel.visible = !!want.labels;
    }
    ruler.visible = !!want.labels && camera.position.y > 0;   // it lies on the floor; from below it would float over the chips
    labels.domElement.hidden = !want.labels;

    renderer.render(scene, camera);
    labels.render(scene, camera);
    requestAnimationFrame(frame);
  }

  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  requestAnimationFrame(frame);

  return {
    set(key, value) {
      want[key] = value ? 1 : 0;
      if (key === 'power') chips.forEach(paintBalls);
    },
    get: (key) => !!want[key],
    focus,
    select(id) { selected = id; },
    raceStart,
    raceStop,
    onPick(f) { listeners.pick.push(f); },
    debug: { chips, camera, renderer, scene },
  };
}
