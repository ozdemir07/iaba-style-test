// Fullscreen Three.js viewer for GitHub Pages
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('c');
const tip = document.getElementById('tooltip');
const tipImg = document.getElementById('tip-img');
const tipCap = document.getElementById('tip-cap');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
resizeRenderer();

let width = canvas.clientWidth, height = canvas.clientHeight;
let camera = makeOrtho(width, height);
const scene = new THREE.Scene();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(2,2);

const coordsRows = (await (await fetch('./coords.csv')).text()).trim().split(/\r?\n/).slice(1);
const files = (await (await fetch('./files.txt')).text()).trim().split(/\r?\n/);

const coords = coordsRows.map(l => l.split(',').map(Number));
const xs = coords.map(r=>r[1]), ys = coords.map(r=>r[2]);
const minX=Math.min(...xs), maxX=Math.max(...xs);
const minY=Math.min(...ys), maxY=Math.max(...ys);
const mapX = x => ((x-minX)/(maxX-minX)-.5)*width;
const mapY = y => ((y-minY)/(maxY-minY)-.5)*height;

const loader = new THREE.TextureLoader();
const group = new THREE.Group(); scene.add(group);

const SPRITE = 110, HOVER = 1.18;

for (let i=0;i<coords.length;i++){
  const [idx,x,y]=coords[i];
  const X=mapX(x), Y=mapY(y);
  const tex = loader.load(files[i], t=>{
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
  });
  const mat = new THREE.SpriteMaterial({ map:tex, transparent:true });
  const s = new THREE.Sprite(mat);
  s.position.set(X,Y,0);
  s.scale.set(SPRITE,SPRITE,1);
  s.userData = {
    path: files[i],
    baseX:X, baseY:Y,
    amp: 8 + Math.random()*12,
    vx: .1 + Math.random()*.35,
    vy: .1 + Math.random()*.35,
    phase: Math.random()*Math.PI*2,
    sBase: .92 + Math.random()*.20,
    sAmp: .10 + Math.random()*.12,
    sFreq: .20 + Math.random()*.25,
    sPhase: Math.random()*Math.PI*2,
    hover:false
  };
  group.add(s);
}

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
    for (let i=0;i<coords.length;i++){
      const [idx,x,y]=coords[i];
      const X=mapX(x), Y=mapY(y);
      const s = group.children[i];
      s.userData.baseX = X; s.userData.baseY = Y;
    }
  }
});

let lastHover=null;
function animate(now){
  const t=(now||performance.now())/1000;

  for (const s of group.children){
    const u=s.userData;
    const x=u.baseX + Math.sin(t*u.vx + u.phase)*u.amp;
    const y=u.baseY + Math.cos(t*u.vy + u.phase)*u.amp;
    s.position.set(x,y,0);
    const k = u.sBase + Math.sin(t*u.sFreq + u.sPhase)*u.sAmp;
    s.scale.set(SPRITE*k*(u.hover?HOVER:1), SPRITE*k*(u.hover?HOVER:1), 1);
  }

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(group.children, false)[0];
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

// helpers
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
