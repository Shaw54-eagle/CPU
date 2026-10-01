// The recipe for three.bundle.min.js: three.js r186 plus the add-ons the page imports,
// bundled into one ES module so the site works offline with no build step at runtime.
//
// To rebuild (in any scratch folder, not in this repo):
//   npm install three@0.186.1 esbuild
//   cp <repo>/vendor/entry.js .
//   npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --outfile=three.bundle.min.js
//   cp three.bundle.min.js <repo>/vendor/
// Add an export line here when a new add-on is needed, then rebuild.

export * from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
