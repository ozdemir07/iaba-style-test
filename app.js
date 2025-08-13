// app.js — simple lines + optional live sliders (robust if panel is missing)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ------------------ DEFAULT PARAMS ------------------
const PARAMS = {
  NODE_INTENSITY: 6.0,
  NODE_MIN_RATIO: 1/14,
  NODE_MAX_RATIO: 1/7,

  IMGIMG_INTENSITY:   1,
  NODEIMG_INTENSITY:  1,
  NODENODE_INTENSITY: 1,

  LINE_OPACITY: { imgimg: 0.5, nodeimg: 0.2, nodenode: 0.1 },
  LINES_BEHIND: true,
};

// ------------------ OPTIONAL UI (safe if absent) ------------------
function $(id){ return document.getElementById(id); }

const ui = {
  linesBehind: $('linesBehind'),
  nodeInt:     $('nodeInt'),
  nodeMin:     $('nodeMin'),
  nodeMax:     $('nodeMax'),
  imgImg:      $('imgImg'),
  nodeImg:     $('nodeImg'),
  nodeNode:    $('nodeNode'),

  nodeIntV:    $('nodeIntV'),
  nodeMinV:    $('nodeMinV'),
  nodeMaxV:    $('nodeMaxV'),
  imgImgV:     $('imgImgV'),
  nodeImgV:    $('nodeImgV'),
  nodeNodeV:   $('nodeNodeV'),
};

const HAS_PANEL =
  // require at least the sliders to exist
  ui.nodeInt && ui.nodeMin && ui.nodeMax && ui.imgImg && ui.nodeImg && ui.nodeNode;

// guard label helpers
function setText(el, txt){ if (el) el.textContent = txt; }
function fmtPct(v){ return Math.round(v*100)+'%'; }
function fmtRatio(v){ return (v*100).toFixed(1)+'% of image'; }

function refreshLabels(){
  if (!HAS_PANEL) return;
  setText(ui.nodeIntV,  fmtPct(parseFloat(ui.nodeInt.value)));
  setText(ui.nodeMinV,  fmtRatio(parseFloat(ui.nodeMin.value)));
  setText(ui.nodeMaxV,  fmtRatio(parseFloat(ui.nodeMax.value)));
  setText(ui.imgImgV,   fmtPct(parseFloat(ui.imgImg.value)));
  setText(ui.nodeImgV,  fmtPct(parseFloat(ui.nodeImg.value)));
  setText(ui.nodeNodeV, fmtPct(parseFloat(ui.nodeNode.value)));
}

function applyParamsFromUI(){
  if (!HAS_PANEL) return;
  PARAMS.LINES_BEHIND        = !!ui.linesBehind?.checked;
  const minVal = parseFloat(ui.nodeMin.value);
  const maxVal = parseFloat(ui.nodeMax.value);
  PARAMS.NODE_INTENSITY      = parseFloat(ui.nodeInt.value);
  PARAMS.NODE_MIN_RATIO      = Math.min(minVal, maxVal - 0.005);
  PARAMS.NODE_MAX_RATIO      = Math.max(maxVal, PARAMS.NODE_MIN_RATIO + 0.005);
  // keep sliders coherent if user crosses them
  if (ui.nodeMin) ui.nodeMin.value = PARAMS.NODE_MIN_RATIO.toFixed(3);
  if (ui.nodeMax) ui.nodeMax.value = PARAMS.NODE_MAX_RATIO.toFixed(3);

  PARAMS.IMGIMG_INTENSITY    = parseFloat(ui.imgImg.value);
  PARAMS.NODEIMG_INTENSITY   = parseFloat(ui.nodeImg.value);
  PARAMS.NODENODE_INTENSITY  = parseFloat(ui.nodeNode.value);

  refreshLabels();
}

// ------------------ DOM (tooltip) ------------------
const canvas = document.getElementById('c');
const tip    = document.getElementById('tooltip');
const tipImg = document.getElementById('tip-img');
const tipCap = document.getElementById('tip-cap');

// ------------------ THREE: renderer / camera ------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
resizeRenderer();

let W = canvas.clientWidth, H = canvas.clientHeight;
let camera = makeOrtho(W, H);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1113);

// z‑order: lines (z=-0.2/0.1) < nodes (z=-0.05) < images (z=0)
const linesGroup = new THREE.Group(); scene.add(linesGroup);
const imgGroup   = new THREE.Group(); scene.add(imgGroup);
const nodeGroup  = new THREE.Group(); scene.add(nodeGroup);

// ------------------ Data load ------------------
const coordsRows = (await (await fetch('./coords.csv')).text()).trim().split(/\r?\n/).slice(1);
const files      = (await (await fetch('./files.txt')).text()).trim().split(/\r?\n/);
const coords = coordsRows.map(l => l.split(',').map(Number));

// map CSV coords to screen space
const xs = coords.map(r=>r[1]), ys = coords.map(r=>r[2]);
const minX=Math.min(...xs), maxX=Math.max(...xs);
const minY=Math.min(...ys), maxY=Math.max(...ys);
const mapX = x => ((x-minX)/Math.max(1e-6,(maxX-minX))-.5)*W;
const mapY = y => ((y-minY)/Math.max(1e-6,(maxY-minY))-.5)*H;

// ------------------ Images (build once) ------------------
const loader = new THREE.TextureLoader();
const SPRITE = 110, HOVER = 1.18;

for (let i=0;i<coords.length;i++){
  const [,x,y] = coords[i];
  const X=mapX(x), Y=mapY(y);
  const tex = loader.load(files[i]||'', t=>{
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter  = THREE.LinearMipmapLinearFilter;
    t.magFilter  = THREE.LinearFilter;
    t.generateMipmaps = true;
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true }));
  s.position.set(X,Y,0);
  s.scale.set(SPRITE,SPRITE,1);
  s.userData = {
    type:'image', path:files[i]||'',
    baseX:X, baseY:Y,
    amp: 8 + Math.random()*12,
    vx: .10 + Math.random()*.35,
    vy: .10 + Math.random()*.35,
    phase: Math.random()*Math.PI*2,
    sBase: .92 + Math.random()*.20,
    sAmp:  .10 + Math.random()*.12,
    sFreq: .20 + Math.random()*.25,
    sPhase: Math.random()*Math.PI*2,
    hover:false
  };
  imgGroup.add(s);
}
const sprites = imgGroup.children;

// ------------------ Nodes (rebuildable) ------------------
function makeCircleTex(d=256){
  const c=document.createElement('canvas'); c.width=c.height=d;
  const g=c.getContext('2d');
  g.clearRect(0,0,d,d);
  g.beginPath(); g.arc(d/2,d/2,d*0.46,0,Math.PI*2);
  g.fillStyle='#ffffff'; g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
const nodeTex = makeCircleTex(256);

function clearGroup(g){
  while(g.children.length){
    const o=g.children.pop();
    if (o.material?.map?.dispose) o.material.map.dispose();
    if (o.material?.dispose) o.material.dispose();
    if (o.geometry?.dispose) o.geometry.dispose();
  }
}

function rebuildNodes(){
  clearGroup(nodeGroup);
  const count = Math.max(0, Math.floor(sprites.length * PARAMS.NODE_INTENSITY));
  for (let i=0;i<count;i++){
    const rx = (Math.random()-0.5)*W*0.85, ry = (Math.random()-0.5)*H*0.85;
    const ratio = Math.min(PARAMS.NODE_MAX_RATIO, Math.max(PARAMS.NODE_MIN_RATIO,
                     PARAMS.NODE_MIN_RATIO + Math.random()*(PARAMS.NODE_MAX_RATIO-PARAMS.NODE_MIN_RATIO)));
    const size  = SPRITE * ratio;
    const n = new THREE.Sprite(new THREE.SpriteMaterial({ map:nodeTex, transparent:true, opacity:0.95, color:0xffffff }));
    n.position.set(rx, ry, -0.05);
    n.scale.set(size, size, 1);
    n.userData = {
      type:'node',
      baseX:rx, baseY:ry, sizeBase:size,
      amp: 10 + Math.random()*18,
      vx:  .05 + Math.random()*.14,
      vy:  .05 + Math.random()*.14,
      phase: Math.random()*Math.PI*2,
      sBase: 0.95 + Math.random()*0.25,
      sAmp:  0.10 + Math.random()*0.18,
      sFreq: 0.12 + Math.random()*0.22,
      sPhase: Math.random()*Math.PI*2
    };
    nodeGroup.add(n);
  }
}
rebuildNodes();
const nodes = nodeGroup.children;

// ------------------ Topology (rebuildable) ------------------
function kFromIntensity(intensity, min=1, max=5){
  return Math.round(THREE.MathUtils.clamp(intensity,0,1)*(max-min)) + min;
}
function kNN(list, K){
  const pairs = new Set();
  for (let i=0;i<list.length;i++){
    const pi = new THREE.Vector2(list[i].userData.baseX, list[i].userData.baseY);
    const ds=[];
    for (let j=0;j<list.length;j++){
      if (i===j) continue;
      const pj = new THREE.Vector2(list[j].userData.baseX, list[j].userData.baseY);
      ds.push({ j, d: pi.distanceTo(pj) });
    }
    ds.sort((a,b)=>a.d-b.d);
    for (let k=0;k<Math.min(K, ds.length);k++){
      const j = ds[k].j;
      const key = i<j ? `${i}-${j}` : `${j}-${i}`;
      pairs.add(key);
    }
  }
  return [...pairs].map(s=>s.split('-').map(Number));
}
let imgLinks=[], nodeLinks=[], nodeImgLinks=[];
function rebuildTopology(){
  const IMG_K       = kFromIntensity(PARAMS.IMGIMG_INTENSITY);
  const NODE_NODE_K = kFromIntensity(PARAMS.NODENODE_INTENSITY);
  const NODE_IMG_K  = kFromIntensity(PARAMS.NODEIMG_INTENSITY);

  imgLinks  = sprites.length>=2 ? kNN(sprites, IMG_K)     : [];
  nodeLinks = nodes.length>=2   ? kNN(nodes,  NODE_NODE_K): [];

  nodeImgLinks = [];
  for (let ni=0; ni<nodes.length; ni++){
    const pn = new THREE.Vector2(nodes[ni].userData.baseX, nodes[ni].userData.baseY);
    const ds = sprites.map((s, j)=>({ j, d: pn.distanceTo(new THREE.Vector2(s.userData.baseX, s.userData.baseY)) }));
    ds.sort((a,b)=>a.d-b.d);
    for (let k=0;k<Math.min(NODE_IMG_K, ds.length); k++) nodeImgLinks.push([ni, ds[k].j]);
  }
}
rebuildTopology();

// ------------------ Simple lines (rebuildable) ------------------
let simpleMeshes = [];
function buildSimpleLines(){
  for (const m of simpleMeshes){ linesGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
  simpleMeshes = [];
  linesGroup.position.z = PARAMS.LINES_BEHIND ? -0.2 : 0.1;

  const categories = [
    { links: imgLinks,     A: sprites, B: sprites, opacity: PARAMS.LINE_OPACITY.imgimg },
    { links: nodeImgLinks, A: nodes,   B: sprites, opacity: PARAMS.LINE_OPACITY.nodeimg },
    { links: nodeLinks,    A: nodes,   B: nodes,   opacity: PARAMS.LINE_OPACITY.nodenode },
  ];

  for (const {links, A, B, opacity} of categories){
    if (!links.length) continue;
    const arr = new Float32Array(links.length * 2 * 3);
    const Aw = new THREE.Vector3(), Bw = new THREE.Vector3();
    let p=0;
    for (const [ai, bi] of links){
      A[ai].getWorldPosition(Aw);
      B[bi].getWorldPosition(Bw);
      arr[p++]=Aw.x; arr[p++]=Aw.y; arr[p++]=linesGroup.position.z;
      arr[p++]=Bw.x; arr[p++]=Bw.y; arr[p++]=linesGroup.position.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setDrawRange(0, links.length * 2);
    geo.computeBoundingSphere();

    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent:true, opacity,
      depthTest: PARAMS.LINES_BEHIND,
    });
    const ls = new THREE.LineSegments(geo, mat);
    ls.renderOrder = PARAMS.LINES_BEHIND ? -1 : 9999;
    ls.frustumCulled = false;

    linesGroup.add(ls);
    simpleMeshes.push(ls);
  }
}
function updateSimpleLines(){
  const cats = [
    { links: imgLinks,     A: sprites, B: sprites },
    { links: nodeImgLinks, A: nodes,   B: sprites },
    { links: nodeLinks,    A: nodes,   B: nodes },
  ];
  for (let i=0;i<simpleMeshes.length;i++){
    const {links, A, B} = cats[i];
    if (!links || !links.length) continue;

    const geo = simpleMeshes[i].geometry;
    const arr = geo.attributes.position.array;
    const Aw = new THREE.Vector3(), Bw = new THREE.Vector3();
    let p=0;
    for (const [ai, bi] of links){
      A[ai].getWorldPosition(Aw);
      B[bi].getWorldPosition(Bw);
      arr[p++]=Aw.x; arr[p++]=Aw.y; arr[p++]=linesGroup.position.z;
      arr[p++]=Bw.x; arr[p++]=Bw.y; arr[p++]=linesGroup.position.z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }
}
buildSimpleLines();

// ------------------ Hook up UI if present ------------------
if (HAS_PANEL){
  // seed slider values from defaults
  if (ui.linesBehind) ui.linesBehind.checked = PARAMS.LINES_BEHIND;
  ui.nodeInt.value = PARAMS.NODE_INTENSITY;
  ui.nodeMin.value = PARAMS.NODE_MIN_RATIO;
  ui.nodeMax.value = PARAMS.NODE_MAX_RATIO;
  ui.imgImg.value  = PARAMS.IMGIMG_INTENSITY;
  ui.nodeImg.value = PARAMS.NODEIMG_INTENSITY;
  ui.nodeNode.value= PARAMS.NODENODE_INTENSITY;
  refreshLabels();

  let applyTimer=null;
  function scheduleRebuild(){
    clearTimeout(applyTimer);
    applyTimer = setTimeout(()=>{
      applyParamsFromUI();
      rebuildNodes();
      rebuildTopology();
      buildSimpleLines();
    }, 120);
  }
  ui.linesBehind?.addEventListener('change', ()=>{ applyParamsFromUI(); buildSimpleLines(); });
  for (const el of [ui.nodeInt, ui.nodeMin, ui.nodeMax, ui.imgImg, ui.nodeImg, ui.nodeNode]){
    el.addEventListener('input', scheduleRebuild);
  }
}

// ------------------ Interactivity ------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(2,2);
window.addEventListener('pointermove', (e)=>{
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX-r.left)/r.width)*2-1;
  mouse.y = -((e.clientY-r.top)/r.height)*2+1;
  tip.style.left = (e.clientX+12)+'px';
  tip.style.top  = (e.clientY+12)+'px';
});

// ------------------ Resize ------------------
window.addEventListener('resize', ()=>{
  if (resizeRenderer()){
    W = canvas.clientWidth; H = canvas.clientHeight;
    camera = makeOrtho(W,H);
    buildSimpleLines(); // update z + draw order
  }
});

// ------------------ Animate ------------------
let lastHover=null;
function animate(now){
  const t=(now||performance.now())/1000;

  // images: drift + breathing + hover
  for (const s of sprites){
    const u=s.userData;
    const x=u.baseX + Math.sin(t*u.vx + u.phase)*u.amp;
    const y=u.baseY + Math.cos(t*u.vy + u.phase)*u.amp;
    s.position.set(x,y,0);
    const k = u.sBase + Math.sin(t*u.sFreq + u.sPhase)*u.sAmp;
    s.scale.set(SPRITE*k*(u.hover?HOVER:1), SPRITE*k*(u.hover?HOVER:1), 1);
  }

  // nodes: drift + animated size
  for (const n of nodeGroup.children){
    const u=n.userData;
    const x=u.baseX + Math.sin(t*u.vx + u.phase)*u.amp;
    const y=u.baseY + Math.cos(t*u.vy + u.phase)*u.amp;
    n.position.set(x,y,-0.05);
    const anim = u.sBase + Math.sin(t*u.sFreq + u.sPhase)*u.sAmp;
    const target = u.sizeBase * anim;
    n.scale.set(
      THREE.MathUtils.lerp(n.scale.x, target, 0.08),
      THREE.MathUtils.lerp(n.scale.y, target, 0.08),
      1
    );
  }

  // keep simple lines in sync
  updateSimpleLines();

  // hover tooltip
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(sprites, false)[0];
  if (hit){
    if (lastHover && lastHover!==hit.object) lastHover.userData.hover=false;
    hit.object.userData.hover=true; lastHover=hit.object;
    tip.style.display='block';
    const p = hit.object.userData.path;
    if (!tipImg.src.endsWith(p)) tipImg.src=p;
    tipCap.textContent = p.split('/').pop();
  } else {
    if (lastHover) lastHover.userData.hover=false;
    lastHover=null; tip.style.display='none';
  }

  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ------------------ Helpers ------------------
function resizeRenderer(){
  const w = window.innerWidth, h = window.innerHeight;
  const need = canvas.width!==w || canvas.height!==h;
  if (need){ renderer.setSize(w,h,false); canvas.style.width='100vw'; canvas.style.height='100vh'; }
  return need;
}
function makeOrtho(w,h){
  const cam = new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,-1000,1000);
  cam.position.z=10; cam.updateProjectionMatrix(); return cam;
}
