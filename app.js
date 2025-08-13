// app.js — Three.js style-space viewer with random drift + breathing scale
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas  = document.getElementById('c');
const tip     = document.getElementById('tooltip');
const tipImg  = document.getElementById('tip-img');
const tipCap  = document.getElementById('tip-caption');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0f1113, 1);
resizeRendererToDisplaySize();

// Scene & camera (orthographic so 1 world unit ≈ 1 screen pixel)
const scene = new THREE.Scene();
let width = canvas.clientWidth, height = canvas.clientHeight;
let camera = makeOrtho(width, height);

// Raycaster for hover
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(2, 2); // offscreen init

// Load data files
const coordsRows = (await (await fetch('coords.csv')).text()).trim().split(/\r?\n/).slice(1);
const thumbs     = (await (await fetch('files.txt')).text()).trim().split(/\r?\n/);

// Parse + normalize coordinates to screen space
const coords = coordsRows.map(l => l.split(',').map(Number));
const xs = coords.map(r => r[1]), ys = coords.map(r => r[2]);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
function mapX(x){ return ((x - minX) / (maxX - minX) - 0.5) * width; }
function mapY(y){ return ((y - minY) / (maxY - minY) - 0.5) * height; }

// Group of sprites
const group = new THREE.Group();
scene.add(group);

// Texture loader
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

// Sprite config
const SPRITE_SIZE = 110;    // base size in pixels
const HOVER_BOOST = 2;   // additional scale on hover 1.18 default

// Build sprites
for (let i = 0; i < coords.length; i++) {
  const [idx, x, y] = coords[i];
  const X = mapX(x), Y = mapY(y);

  const tex = loader.load(thumbs[i], t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
  });

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const spr = new THREE.Sprite(mat);

  spr.scale.set(SPRITE_SIZE, SPRITE_SIZE, 10); // SPRITE_SIZE 1 default
  spr.position.set(X, Y, 0);

  // Randomized motion parameters (gentle)
  spr.userData = {
    path: thumbs[i],
    baseX: X, baseY: Y,
    amp: 8 + Math.random() * 12,            // movement amplitude (px)
    vx: 0.10 + Math.random() * 2,        // x speed (Hz-ish) 0.35 default
    vy: 0.10 + Math.random() * 0.35,        // y speed
    phase: Math.random() * Math.PI * 2,     // motion phase
    sBase: 0.92 + Math.random() * 0.20,     // base scale factor
    sAmp: 0.10 + Math.random() * 0.5,      // breathing amplitude 0.12 default
    sFreq: 0.20 + Math.random() * 0.25,     // breathing speed
    sPhase: Math.random() * Math.PI * 2,
    hovered: false
  };

  group.add(spr);
}

// Pointer move updates mouse + tooltip position
window.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  mouse.x = px * 2 - 1;
  mouse.y = -(py * 2 - 1);
  // Move tooltip near cursor
  tip.style.left = (e.clientX + 12) + 'px';
  tip.style.top  = (e.clientY + 12) + 'px';
});

// Resize handler
window.addEventListener('resize', () => {
  if (resizeRendererToDisplaySize()) {
    width = canvas.clientWidth; height = canvas.clientHeight;
    camera = makeOrtho(width, height);
    // Re-map base positions to new screen size
    for (let i = 0; i < coords.length; i++) {
      const [idx, x, y] = coords[i];
      const spr = group.children[i];
      const X = mapX(x), Y = mapY(y);
      spr.userData.baseX = X; spr.userData.baseY = Y;
    }
  }
});

// Animation loop
let lastHover = null;
function animate(now) {
  const t = (now || performance.now()) / 1000;

  // Gentle drift + breathing
  for (const s of group.children) {
    const u = s.userData;
    const x = u.baseX + Math.sin(t * u.vx + u.phase) * u.amp;
    const y = u.baseY + Math.cos(t * u.vy + u.phase) * u.amp;
    s.position.set(x, y, 0);

    const k = u.sBase + Math.sin(t * u.sFreq + u.sPhase) * u.sAmp;
    const hoverK = u.hovered ? HOVER_BOOST : 1.0;
    s.scale.set(SPRITE_SIZE * k * hoverK, SPRITE_SIZE * k * hoverK, 1);
  }

  // Hover detect
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(group.children, false);

  if (hits.length) {
    const s = hits[0].object;
    if (lastHover && lastHover !== s) lastHover.userData.hovered = false;
    s.userData.hovered = true;
    lastHover = s;

    // Show tooltip with the same image path
    tip.style.display = 'block';
    const p = s.userData.path;
    if (tipImg.src.endsWith(p) === false) tipImg.src = p;
    tipCap.textContent = p.split('/').pop();
  } else {
    if (lastHover) lastHover.userData.hovered = false;
    lastHover = null;
    tip.style.display = 'none';
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ------- helpers -------
function resizeRendererToDisplaySize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const needResize = canvas.width !== w || canvas.height !== h;
  if (needResize) {
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  return needResize;
}
function makeOrtho(w, h) {
  const cam = new THREE.OrthographicCamera(-w/2, w/2, h/2, -h/2, -1000, 1000);
  cam.position.z = 10;
  cam.updateProjectionMatrix();
  return cam;
}
