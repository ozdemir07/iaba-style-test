// app.js — Fullscreen Three.js viewer with drift, breathing, lines, and circle nodes
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('c');
const tip    = document.getElementById('tooltip');
const tipImg = document.getElementById('tip-img');
const tipCap = document.getElementById('tip-cap');

// ----- renderer -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
resizeRenderer();

let width = canvas.clientWidth, height = canvas.clientHeight;
let camera = makeOrtho(width, height);
const scene = new THREE.Scene();

// ----- data -----
const coordsRows = (await (await fetch('./coords.csv')).text()).trim().split(/\r?\n/).slice(1);
const files      = (await (await fetch('./files.txt')).text()).trim().split(/\r?\n/);
const coords = coordsRows.map(l => l.split(',').map(Number));
const xs = coords.map(r=>r[1]), ys = coords.map(r=>r[2]);
const minX=Math.min(...xs), maxX=Math.max(...xs);
const minY=Math.min(...ys), maxY=Math.max(...ys);
const mapX = x => ((x-minX)/(maxX-minX)-.5)*width;
const mapY = y => ((y-minY)/(maxY-minY)-.5)*height;

// ----- sprites (thumbnails) -----
const loader = new THREE.TextureLoader();
const group = new THREE.Group(); scene.add(group);

const SPRITE = 110, HOVER = 1.18;
for (let i=0;i<coords.length;i++){
  const [idx,x,y]=coords[i];
  const X=mapX(x), Y=mapY(y);

  const tex = loader.load(files[i], t=>{
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter  = THREE.LinearMipmapLinearFilter;
    t.magFilter  = THREE.LinearFilter;
    t.generateMipmaps = true;
  });
  const mat = new THREE.SpriteMaterial({ map:tex, transparent:true });
  const s = new THREE.Sprite(mat);
  s.position.set(X,Y,0);
  s.scale.set(SPRITE,SPRITE,1);
  s.userData = {
    path: files[i],
    baseX:X, baseY:Y,
    amp: 8 + Math.random()*12,     // motion amplitude (px)
    vx: .1 + Math.random()*.35,    // x speed
    vy: .1 + Math.random()*.35,    // y speed
    phase: Math.random()*Math.PI*2,
    sBase: .92 + Math.random()*.20,// base scale
    sAmp: .10 + Math.random()*.12, // breathing amp
    sFreq: .20 + Math.random()*.25,// breathing speed
    sPhase: Math.random()*Math.PI*2,
    hover:false
  };
  group.add(s);
}
const sprites = group.children;

// ----- nearest-neighbor white lines -----
const K = 2;                                  // how many neighbors per node
const pairSet = new Set();
for (let i=0;i<sprites.length;i++){
  const pi = new THREE.Vector2(sprites[i].userData.baseX, sprites[i].userData.baseY);
  const ds = [];
  for (let j=0;j<sprites.length;j++){
    if (i===j) continue;
    const pj = new THREE.Vector2(sprites[j].userData.baseX, sprites[j].userData.baseY);
    ds.push({ j, d: pi.distanceTo(pj) });
  }
  ds.sort((a,b)=>a.d-b.d);
  for (let k=0;k<K;k++){
    const j = ds[k].j;
    const key = i<j ? `${i}-${j}` : `${j}-${i}`;
    pairSet.add(key);
  }
}
const links = [...pairSet].map(s => s.split('-').map(Number));
const linePositions = new Float32Array(links.length * 2 * 3);
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
const lineMat = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.18 });
const lineSegs = new THREE.LineSegments(lineGeo, lineMat);
lineSegs.renderOrder = -1; // behind sprites
scene.add(lineSegs);

// ----- arbitrary white circle nodes (background seasoning) -----
const CIRCLES = 80;
const circleGeom = new THREE.CircleGeometry(2.2, 24); // small white dots
const circleMat  = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.22 });
const circleGroup = new THREE.Group(); scene.add(circleGroup);

for (let i=0;i<CIRCLES;i++){
  const m = new THREE.Mesh(circleGeom, circleMat.clone());
  // random spawn across screen, slight z to sit behind sprites/lines
  m.position.set((Math.random()-0.5)*width, (Math.random()-0.5)*height, -0.3);
  // random drift params
  m.userData = {
    baseX:m.position.x, baseY:m.position.y,
    amp: 15 + Math.random()*35,
    vx:  .03 + Math.random()*.12,
    vy:  .03 + Math.random()*.12,
    phase: Math.random()*Math.PI*2
  };
  circleGroup.add(m);
}

// ----- interactivity -----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(2,2);

window.addEventListener('pointermove', (e)=>{
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX-r.left)/r.width)*2-1;
  mouse.y = -((e.clientY-r.top)/r.height)*2+1;
  tip.style.left = (e.clientX+12)+'px';
  tip.style.top  = (e.clientY+12)+'px';
});

window.addEventListener('resize', ()=>{
  if (resizeRenderer()){
    width = canvas.clientWidth; height = canvas.clientHeight;
    camera = makeOrtho(width,height);
    // re-map sprite bases
    for (let i=0;i<coords.length;i++){
      const [idx,x,y]=coords[i];
      const X=mapX(x), Y=mapY(y);
      const s = sprites[i];
      s.userData.baseX = X; s.userData.baseY = Y;
    }
    // reposition circles to fit new screen bounds (keep relative)
    circleGroup.children.forEach((m)=>{
      m.userData.baseX = THREE.MathUtils.clamp(m.userData.baseX, -width/2,  width/2);
      m.userData.baseY = THREE.MathUtils.clamp(m.userData.baseY, -height/2, height/2);
    });
  }
});

// ----- animate -----
let lastHover=null;
function animate(now){
  const t=(now||performance.now())/1000;

  // sprite drift + breathing
  for (const s of sprites){
    const u=s.userData;
    const x=u.baseX + Math.sin(t*u.vx + u.phase)*u.amp;
    const y=u.baseY + Math.cos(t*u.vy + u.phase)*u.amp;
    s.position.set(x,y,0);
    const k = u.sBase + Math.sin(t*u.sFreq + u.sPhase)*u.sAmp;
    s.scale.set(SPRITE*k*(u.hover?HOVER:1), SPRITE*k*(u.hover?HOVER:1), 1);
  }

  // circles drift (calmer)
  for (const m of circleGroup.children){
    const u=m.userData;
    const x=u.baseX + Math.sin(t*u.vx + u.phase)*u.amp;
    const y=u.baseY + Math.cos(t*u.vy + u.phase)*u.amp;
    m.position.set(x,y,-0.3);
  }

  // update line geometry to follow sprite positions
  let off=0;
  for (const [a,b] of links){
    const A=sprites[a].position, B=sprites[b].position;
    linePositions[off++] = A.x; linePositions[off++] = A.y; linePositions[off++] = -0.2;
    linePositions[off++] = B.x; linePositions[off++] = B.y; linePositions[off++] = -0.2;
  }
  lineGeo.attributes.position.needsUpdate = true;

  // hover detection
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

// ----- helpers -----
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
