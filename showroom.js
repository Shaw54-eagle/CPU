// The Showroom: one realistic package, modelled in Blender, lit like a product shot.
//
// It owns a canvas of its own over the viewport, separate from the bench, because
// it wants different things: physical materials, image-based light, soft shadows
// and filmic tone mapping. The model is models/chip.glb, exported by
// blender/make_chip.py. Each top-level node carries extras from Blender:
// label, info, and explode (millimetres to lift that layer when pulled apart).
// One scene unit is one millimetre.

import * as THREE from 'three';
import { OrbitControls, GLTFLoader } from 'three';
import { esc } from './ui.js';

const MODEL = './models/chip.glb';
const EXPLODE_GAIN = 1.25;     // the Blender offsets, stretched a little for a screen
const LID_PARTS = ['heat-spreader', 'sealant', 'solder-tim'];
// GLTFLoader turns spaces in node names into underscores; parts go by a slug instead.
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Three lighting setups. Each builds its own environment map from emissive cards,
// the way a studio hangs softboxes, plus one shadow-casting key light.
export const PRESETS = {
  studio: {
    name: 'Studio', exposure: 1.0, envBg: 0x0c0d10, key: 1.6, shadow: 0.42, env: 1.0,
    bg: 'radial-gradient(120% 90% at 50% 38%, #4a4e55 0%, #2a2d32 46%, #121417 100%)',
    cards: [
      // [width, height, position, brightness, colour]
      [15, 10, [-11, 15, 9], 9, 0xfff6ec],     // key, high and to the left
      [18, 12, [15, 7, 6], 1.8, 0xeef3ff],     // fill
      [22, 2.6, [0, 6, -14], 14, 0xffffff],    // rim strip behind
      [12, 12, [2, 23, -1], 2.6, 0xffffff],    // overhead
      [28, 17, [-11, 10, -14], 2.2, 0xffffff], // the card the heat spreader mirrors
      [60, 4, [0, -6, 0], 0.35, 0xb8bec8],     // floor bounce
    ],
  },
  dark: {
    name: 'Dark room', exposure: 0.95, envBg: 0x020203, key: 0.9, shadow: 0.6, env: 0.85,
    bg: 'radial-gradient(110% 80% at 50% 42%, #1c1e24 0%, #0b0c0f 55%, #020203 100%)',
    cards: [
      [26, 1.6, [-2, 5, -15], 26, 0xb9d4ff],    // cool rim, low behind
      [1.6, 18, [16, 6, -4], 16, 0xffc58a],     // warm strip on the right
      [10, 6, [-12, 16, 6], 4, 0xffffff],       // small key
      [8, 8, [0, 24, 0], 0.8, 0xffffff],
    ],
  },
  bright: {
    name: 'Bright', exposure: 1.08, envBg: 0xc8ccd2, key: 2.2, shadow: 0.26, env: 1.0,
    bg: 'radial-gradient(120% 95% at 50% 35%, #f4f6f8 0%, #dfe3e8 55%, #c3c8cf 100%)',
    cards: [
      [30, 30, [0, 24, 0], 3.2, 0xffffff],
      [30, 18, [-16, 12, 10], 2.4, 0xffffff],
      [30, 18, [16, 12, 10], 2.0, 0xffffff],
      [40, 14, [0, 10, -18], 2.6, 0xffffff],
      [60, 6, [0, -5, 0], 1.2, 0xe8ebef],
    ],
  },
};

// Camera framings. Positions are in millimetres, y up.
const VIEWS = {
  hero: { pos: [58, 52, 74], target: [0, 1.0, -1.5], name: 'Hero' },
  top: { pos: [0, 118, 0.01], target: [0, 0, 0], name: 'Top' },
  edge: { pos: [82, 9, 34], target: [0, 2.2, 0], name: 'Edge' },
  die: { pos: [16, 30, 28], target: [0, 1.6, 0], name: 'Die' },
  under: { pos: [-52, 58, 70], target: [0, 1.0, 0], name: 'Underside' },
  life: { pos: [0, 0, 0.01], target: [0, 0, 0], name: 'Life size' },
};

export function createShowroom(host) {
  const stage = document.createElement('div');
  stage.className = 'sr';
  stage.id = 'sr';
  stage.hidden = true;
  stage.innerHTML = `
    <canvas id="sr-canvas" aria-label="A realistic CPU package. Drag to turn it, scroll to zoom, click a part."></canvas>
    <div class="sr-load" id="sr-load" role="status"><b>Loading the model</b><span class="sr-bar"><i id="sr-bar"></i></span><span id="sr-pct">0%</span></div>
    <div class="sr-tip" id="sr-tip" hidden></div>
    <p class="sr-hint">Drag to turn · scroll to zoom · right-drag to pan · click a part</p>
    <div class="sr-life" id="sr-life" hidden>Life size at 96 CSS pixels to the inch. Hold a ruler to the screen: if 40 mm doesn’t measure 40 mm, your display is denser or looser than that.</div>`;
  host.appendChild(stage);
  const canvas = stage.querySelector('#sr-canvas');
  const tip = stage.querySelector('#sr-tip');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  camera.position.set(...VIEWS.hero.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...VIEWS.hero.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 14;
  controls.maxDistance = 900;
  controls.autoRotateSpeed = 1.1;
  controls.update();

  // Floor: only the shadow shows; the gradient behind the canvas is the backdrop.
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.4 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-30, 90, 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 5;
  scene.add(key);

  // The model sits in a pivot so it can be turned over without touching orbit.
  const pivot = new THREE.Group();
  scene.add(pivot);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};
  function envFor(id) {
    if (envCache[id]) return envCache[id];
    const p = PRESETS[id];
    const s = new THREE.Scene();
    s.background = new THREE.Color(p.envBg);
    for (const [w, h, pos, k, col] of p.cards) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      s.add(m);
    }
    envCache[id] = pmrem.fromScene(s, 0.03).texture;
    s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return envCache[id];
  }

  // --- State -----------------------------------------------------------------

  const state = {
    ready: false, error: null, progress: 0,
    explode: 0, lid: true, flipped: false, spin: false, preset: 'studio', view: 'hero',
    selected: null, hovered: null, size: null,
  };
  const parts = [];             // { id, name, label, info, explode, obj, base, mats }, top to bottom
  const anim = { explode: 0, lid: 1, flip: 0 };   // what is drawn, easing toward state
  let listeners = [];
  const emit = () => listeners.forEach((f) => f(state));

  // Selection: corner brackets round the part, like a camera's focus box.
  const brackets = new THREE.LineSegments(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffc35a, depthTest: false, transparent: true, opacity: 0.95 }));
  brackets.renderOrder = 10;
  brackets.visible = false;
  scene.add(brackets);
  function setBrackets(box) {
    const { min: a, max: b } = box;
    const pad = 0.6;
    const lo = a.clone().subScalar(pad), hi = b.clone().addScalar(pad);
    const len = Math.min(4, (hi.x - lo.x) * 0.22, (hi.z - lo.z) * 0.22, Math.max(0.8, (hi.y - lo.y) * 0.45));
    const pts = [];
    for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) {
      const sx = x === lo.x ? 1 : -1, sy = y === lo.y ? 1 : -1, sz = z === lo.z ? 1 : -1;
      pts.push(x, y, z, x + sx * len, y, z, x, y, z, x, y + sy * Math.min(len, hi.y - lo.y), z, x, y, z, x, y, z + sz * len);
    }
    brackets.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    brackets.geometry.computeBoundingSphere();
  }

  // --- Load ------------------------------------------------------------------

  let loading = null;
  function load() {
    if (loading) return loading;
    const bar = stage.querySelector('#sr-bar'), pct = stage.querySelector('#sr-pct');
    loading = new Promise((resolve) => {
      new GLTFLoader().load(MODEL, (gltf) => {
        build(gltf.scene);
        state.ready = true;
        stage.querySelector('#sr-load').hidden = true;
        emit();
        resolve();
      }, (e) => {
        if (!e.total) return;
        state.progress = e.loaded / e.total;
        bar.style.width = `${(state.progress * 100).toFixed(0)}%`;
        pct.textContent = `${(state.progress * 100).toFixed(0)}% of ${(e.total / 1e6).toFixed(1)} MB`;
      }, (err) => {
        state.error = String(err && err.message ? err.message : err);
        stage.querySelector('#sr-load').innerHTML = `<b>The model didn’t load</b><span>models/chip.glb is missing or unreadable. Rebuild it with <code>python blender/make_chip.py --export</code>, or open the page through <code>serve.py</code> rather than as a file.</span>`;
        stage.querySelector('#sr-load').classList.add('bad');
        emit();
        resolve();
      });
    });
    return loading;
  }

  function build(root) {
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    for (const obj of [...root.children]) {
      const ud = obj.userData || {};
      const mats = [];
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = upgrade(o.material.clone(), maxAniso);
        mats.push(o.material);
      });
      const id = slug(obj.name);
      parts.push({
        id, name: obj.name.replace(/_/g, ' '), label: ud.label || obj.name, info: ud.info || '', explode: +ud.explode || 0,
        obj, base: obj.position.clone(), mats, lid: LID_PARTS.includes(id),
      });
      pivot.add(obj);
    }
    // Each part's extent at rest, so the model can always be stood on the floor.
    pivot.updateMatrixWorld(true);
    for (const p of parts) {
      const box = new THREE.Box3().setFromObject(p.obj);
      p.bottom = box.min.y;
      p.top = box.max.y;
    }
    parts.sort((a, b) => (b.explode - a.explode) || (b.top - a.top));
    lift = -Math.min(...parts.map((p) => p.bottom));
    const all = new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3());
    state.size = { x: all.x, y: all.y, z: all.z };
    applyPreset(state.preset);
  }

  // The exporter keeps clear coat and brushed-metal anisotropy, but not thin-film
  // interference, which is what makes a die shimmer. Put that back by name.
  function upgrade(m, maxAniso) {
    for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap']) if (m[k]) m[k].anisotropy = maxAniso;
    if (m.name === 'Silicon die') {
      const p = m.isMeshPhysicalMaterial ? m : Object.assign(new THREE.MeshPhysicalMaterial(), { name: m.name, map: m.map, metalness: m.metalness, roughness: m.roughness });
      p.iridescence = 1;
      p.iridescenceIOR = 1.45;
      p.iridescenceThicknessRange = [340, 460];
      p.clearcoat = 0.5;
      p.clearcoatRoughness = 0.03;
      return p;
    }
    return m;
  }

  // --- Controls ----------------------------------------------------------------

  function applyPreset(id) {
    const p = PRESETS[id] || PRESETS.studio;
    state.preset = id in PRESETS ? id : 'studio';
    scene.environment = envFor(state.preset);
    renderer.toneMappingExposure = p.exposure;
    key.intensity = p.key;
    floorMat.opacity = p.shadow;
    stage.style.background = p.bg;
    stage.dataset.preset = state.preset;
    for (const part of parts) for (const m of part.mats) m.envMapIntensity = p.env;
  }

  let tween = null;
  function view(id) {
    const v = VIEWS[id];
    if (!v) return;
    state.view = id;
    let pos = new THREE.Vector3(...v.pos), target = new THREE.Vector3(...v.target);
    if (id === 'under' && !state.flipped) setFlip(true);
    if (id !== 'under' && id !== 'life' && state.flipped && id !== 'edge') setFlip(false);
    if (id === 'die') { setLid(false); if (state.explode > 0.2) setExplode(0); }
    if (id === 'life') {
      // Straight down, at the distance where one millimetre is 96/25.4 CSS pixels.
      const h = canvas.clientHeight || 600;
      const dist = (h * 25.4 / 96) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const top = state.size ? state.size.y : 4.2;
      pos = new THREE.Vector3(0, top + dist, 0.001);
      target = new THREE.Vector3(0, top, 0);
      setSpin(false);
    }
    if (id === 'hero' || id === 'edge' || id === 'under') {
      // Pulled apart, the stack is taller: aim higher and stand back.
      const up = 8 * state.explode;
      target.y += up;
      pos.sub(target).multiplyScalar(1 + 0.4 * state.explode).add(target);
      pos.y += up;
    }
    stage.querySelector('#sr-life').hidden = id !== 'life';
    tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: pos, toT: target, t0: performance.now(), dur: 1100 };
    emit();
  }

  function setExplode(v) { state.explode = Math.max(0, Math.min(1, +v)); emit(); }
  function setLid(on) { state.lid = !!on; if (!state.lid && LID_PARTS.includes(state.selected)) select(null); emit(); }
  function setFlip(on) { state.flipped = !!on; emit(); }
  function setSpin(on) { state.spin = !!on; controls.autoRotate = state.spin; emit(); }

  function select(id) {
    state.selected = parts.some((p) => p.id === id) ? id : null;
    brackets.visible = !!state.selected;
    emit();
  }

  function focusPart(id) {
    const p = parts.find((q) => q.id === id);
    if (!p) return;
    if (p.lid && !state.lid) setLid(true);
    select(id);
    const box = new THREE.Box3().setFromObject(p.obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 4);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.25) { dir.y = 0.35; dir.normalize(); }
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9;
    tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: c.clone().add(dir.multiplyScalar(dist)), toT: c, t0: performance.now(), dur: 1000 };
  }

  // --- Picking ------------------------------------------------------------------

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let ptrPx = null, downAt = null;
  function partAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    // The raycaster ignores visibility, so a lid that has been taken off would still be hit.
    for (const h of ray.intersectObject(pivot, true)) {
      let o = h.object;
      while (o.parent && o.parent !== pivot) o = o.parent;
      const p = parts.find((q) => q.obj === o);
      if (p && p.obj.visible && !(p.lid && anim.lid < 0.5)) return p;
    }
    return null;
  }
  canvas.addEventListener('pointermove', (ev) => { ptrPx = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerleave', () => { ptrPx = null; });
  canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 5) return;
    const p = partAt(ev.clientX, ev.clientY);
    select(p ? p.id : null);
  });
  canvas.addEventListener('dblclick', (ev) => {
    const p = partAt(ev.clientX, ev.clientY);
    if (p) focusPart(p.id);
  });
  controls.addEventListener('start', () => { tween = null; });

  // --- Frame ---------------------------------------------------------------------

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const approach = (cur, goal, dt, rate = 7) => cur + (goal - cur) * (1 - Math.exp(-dt * rate));
  let running = false, last = 0, hoverCheck = 0;
  let lift = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (k >= 1) tween = null;
    }
    anim.explode = approach(anim.explode, state.explode, dt, 6);
    anim.lid = approach(anim.lid, state.lid ? 1 : 0, dt, 5);
    anim.flip = approach(anim.flip, state.flipped ? 1 : 0, dt, 3.2);
    if (Math.abs(anim.flip - (state.flipped ? 1 : 0)) < 1e-4) anim.flip = state.flipped ? 1 : 0;

    if (parts.length) {
      const f = anim.flip, turn = ease(f);
      let lo = Infinity, hi = -Infinity;
      for (const p of parts) {
        const off = p.explode * anim.explode * EXPLODE_GAIN;
        // Taking the lid off lifts it away (upward, whichever way the chip faces) and fades it out.
        const away = p.lid ? (1 - anim.lid) : 0;
        p.obj.position.set(p.base.x + away * 6, p.base.y + off + away * 26 * Math.cos(Math.PI * turn), p.base.z - away * 4);
        if (!p.lid || state.lid) { lo = Math.min(lo, p.bottom + off); hi = Math.max(hi, p.top + off); }
        const op = p.lid ? Math.max(0, Math.min(1, anim.lid * 1.6 - 0.3)) : 1;
        p.obj.visible = op > 0.01;
        for (const m of p.mats) {
          const tr = op < 0.999;
          if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
          m.opacity = op;
          m.depthWrite = !tr;
        }
      }
      // Turn over, arcing up so it clears the floor, and come to rest on whichever face is down.
      pivot.rotation.z = Math.PI * turn;
      lift = approach(lift, (1 - turn) * -lo + turn * hi + 0.02, dt, 8);
      pivot.position.y = lift + Math.sin(Math.PI * turn) * 26;
    }

    if (state.selected) {
      const p = parts.find((q) => q.id === state.selected);
      if (p && p.obj.visible) { setBrackets(new THREE.Box3().setFromObject(p.obj)); brackets.visible = true; } else brackets.visible = false;
    }

    // Hover tooltip, a few times a second rather than every frame.
    if (ptrPx && now - hoverCheck > 60 && state.ready) {
      hoverCheck = now;
      const p = partAt(ptrPx.x, ptrPx.y);
      state.hovered = p ? p.id : null;
      canvas.style.cursor = p ? 'pointer' : '';
      if (p) {
        const r = stage.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(p.label)}</b><span>Click for details · double-click to fly in</span>`;
        tip.hidden = false;
        const x = Math.min(ptrPx.x - r.left + 14, r.width - tip.offsetWidth - 8);
        const y = Math.max(8, ptrPx.y - r.top - tip.offsetHeight - 10);
        tip.style.transform = `translate(${x}px, ${y}px)`;
      } else tip.hidden = true;
    } else if (!ptrPx) { tip.hidden = true; state.hovered = null; }

    controls.update(dt);   // time-based, so the turntable turns at the same speed at any frame rate
    renderer.render(scene, camera);
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  function show() {
    stage.hidden = false;
    resize();
    load();
    pause(false);
  }
  // Stop drawing without leaving, e.g. while a render is shown over the live view.
  function pause(on) {
    if (on && running) { running = false; renderer.setAnimationLoop(null); }
    if (!on && !running && !stage.hidden) { running = true; last = 0; renderer.setAnimationLoop(frame); }
  }
  function hide() {
    stage.hidden = true;
    tip.hidden = true;
    ptrPx = null;
    pause(true);
  }

  return {
    show, hide, pause, load, view, select, focusPart, setExplode, setLid, setFlip, setSpin,
    preset: (id) => { applyPreset(id); emit(); },
    onChange(f) { listeners.push(f); return () => { listeners = listeners.filter((g) => g !== f); }; },
    get state() { return state; },
    // explode is in millimetres as drawn on screen.
    get parts() { return parts.map(({ id, name, label, info, explode, lid }) => ({ id, name, label, info, explode: explode * EXPLODE_GAIN, lid })); },
    // For check.py: where things are drawn, not what the state says.
    debug: {
      renderer, camera, scene, pivot, controls,
      drawn: () => ({
        explode: anim.explode, lid: anim.lid, flip: anim.flip,
        positions: Object.fromEntries(parts.map((p) => [p.id, p.obj.position.y + 0])),
        visible: Object.fromEntries(parts.map((p) => [p.id, p.obj.visible])),
        rotation: pivot.rotation.z, autoRotate: controls.autoRotate, bracket: brackets.visible, running,
      }),
      project(id) {
        const p = parts.find((q) => q.id === id);
        if (!p) return null;
        const c = new THREE.Box3().setFromObject(p.obj).getCenter(new THREE.Vector3()).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (c.x + 1) / 2 * r.width, y: r.top + (1 - c.y) / 2 * r.height };
      },
    },
  };
}
