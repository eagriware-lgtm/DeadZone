import * as THREE from 'three';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/PointerLockControls.js';

const game = document.getElementById('game');
const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const levelComplete = document.getElementById('levelComplete');
const gameOver = document.getElementById('gameOver');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 1.7, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = {};
const zombies = [];
const obstacles = [];
let bullets = [];
let car = null;
let started = false;
let inCar = false;
let level = 1;
let hp = 100;
let stamina = 100;
let kills = 0;
let levelKills = 0;
let targetKills = 6;
let levelTime = 0;
let spawnTimer = 0;
let shootCooldown = 0;
let toastTimer = 0;
let theme = null;

const themes = [
  { name:'OUTBREAK', sky:0x101612, fog:0x101612, ground:0x202821, accent:0x65776a, density:0.013 },
  { name:'ROADRUN', sky:0x111519, fog:0x111519, ground:0x252b2d, accent:0x6b777b, density:0.011 },
  { name:'THE FALL', sky:0x0e1016, fog:0x0e1016, ground:0x1f2027, accent:0x68646e, density:0.016 },
  { name:'DEADZONE', sky:0x140e0d, fog:0x140e0d, ground:0x29211f, accent:0x776a66, density:0.014 },
  { name:'LAST LIGHT', sky:0x17120d, fog:0x17120d, ground:0x2b241b, accent:0x8b795f, density:0.010 }
];

const hemi = new THREE.HemisphereLight(0x9fb4a3, 0x11130f, 1.35);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb9d0bd, 1.8);
moon.position.set(-25, 35, 18);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
scene.add(moon);

const world = new THREE.Group();
const city = new THREE.Group();
const actors = new THREE.Group();
scene.add(world, actors);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color:0x202820, roughness:1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);

function mat(color, rough=0.8, emissive=0x000000) {
  return new THREE.MeshStandardMaterial({color, roughness:rough, emissive, emissiveIntensity:0.25});
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); });
  }
}

function levelInfo(n) {
  const act = Math.min(5, Math.floor((n - 1) / 50) + 1);
  const local = ((n - 1) % 50) + 1;
  const names = [
    'FIRST NIGHT','BROKEN STREETS','LOCKED DOORS','SIGNAL LOST','SAFEHOUSE',
    'EMPTY BLOCK','THE SEARCH','NIGHT RUN','NO POWER','THE SIREN'
  ];
  return { act, local, name: names[(local - 1) % names.length] };
}

function buildCity() {
  clearGroup(city);
  obstacles.length = 0;
  const size = 220;
  const road = theme === themes[1] ? 18 : 14;
  const buildingMat = mat(theme.accent);
  for (let x = -size/2; x <= size/2; x += 28) {
    for (let z = -size/2; z <= size/2; z += 28) {
      if (Math.abs(x) < road || Math.abs(z) < road) continue;
      const h = 7 + ((Math.abs(x * 13 + z * 7) % 13));
      const w = 18 + ((Math.abs(x * 3 + z * 5) % 7));
      const d = 18 + ((Math.abs(x * 5 + z * 2) % 7));
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat.clone());
      b.material.color.offsetHSL(0, 0, ((x + z) % 9) * 0.008);
      b.position.set(x + ((z % 3) * 2), h/2, z + ((x % 3) * 2));
      b.castShadow = true; b.receiveShadow = true;
      city.add(b);
      obstacles.push({ x:b.position.x, z:b.position.z, w:w/2+1.5, d:d/2+1.5 });
      for (let y=2.5; y<h-1; y+=2.5) {
        const windowMat = mat(0x39463d, 0.5, ((x+y+z)%5===0)?0x526e5b:0x000000);
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, .75, .08), windowMat);
        win.position.set(b.position.x + (Math.sin(y+x)*w*.35), y, b.position.z + d/2 + .04);
        city.add(win);
      }
    }
  }
  world.add(city);
}

function buildRoadDetails() {
  const roadMat = mat(0x171b18);
  const laneMat = mat(0x667067);
  for (const axis of ['x','z']) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(220, 15), roadMat);
    road.rotation.x = -Math.PI/2;
    if (axis === 'x') road.position.y = .015;
    else { road.rotation.z = Math.PI/2; road.position.y = .016; }
    world.add(road);
    for (let p=-100;p<100;p+=12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?6:.16,.03,axis==='x'?.16:6),laneMat);
      dash.position.set(axis==='x'?p:0,.04,axis==='x'?0:p);
      world.add(dash);
    }
  }
}

function makeCar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2,1.1,2.1),mat(0x4b5a50,0.55));
  body.position.y=.85; body.castShadow=true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3,.9,1.8),mat(0x202823,0.35));
  cabin.position.set(-.25,1.65,0); cabin.castShadow=true; g.add(cabin);
  const wheelMat=mat(0x0b0d0c);
  for(const x of [-1.45,1.45]) for(const z of [-1.02,1.02]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.22,16),wheelMat);
    w.rotation.x=Math.PI/2;w.position.set(x,.43,z);g.add(w);
  }
  g.position.set(6,0,6);
  g.userData.speed=0;
  world.add(g);
  return g;
}

function makeZombie() {
  const g=new THREE.Group();
  const skin=mat(0x74867a);
  const dark=mat(0x202520);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.85,4,8),skin);
  body.position.y=1.05;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,12,8),skin);
  head.position.y=1.82;head.castShadow=true;g.add(head);
  const eyeMat=mat(0xd9e6db,0.4,0x9ebda7);
  for(const x of [-.11,.11]){const e=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),eyeMat);e.position.set(x,1.88,.31);g.add(e);}
  g.userData.speed=.75+Math.min(1.1,levelInfo(level).local*.018);
  g.userData.hp=1+(levelInfo(level).act>=3?1:0);
  actors.add(g);zombies.push(g);return g;
}

function spawnZombie() {
  const z=makeZombie();
  const side=Math.floor(Math.random()*4);
  const distance=25+Math.random()*30;
  if(side===0){z.position.set((Math.random()-.5)*distance*2,-0.01,-distance);}
  if(side===1){z.position.set((Math.random()-.5)*distance*2,-0.01,distance);}
  if(side===2){z.position.set(-distance,-0.01,(Math.random()-.5)*distance*2);}
  if(side===3){z.position.set(distance,-0.01,(Math.random()-.5)*distance*2);}
}

function removeZombie(z) {
  const i=zombies.indexOf(z); if(i>=0) zombies.splice(i,1);
  actors.remove(z);
  z.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
}

function blocked(x,z) {
  for(const o of obstacles) if(x>o.x-o.w&&x<o.x+o.w&&z>o.z-o.d&&z<o.z+o.d)return true;
  return false;
}

function resetLevel() {
  zombies.splice(0).forEach(z=>actors.remove(z));
  bullets=[];
  hp=100;stamina=100;kills=0;levelKills=0;levelTime=0;spawnTimer=.3;inCar=false;
  camera.position.set(0,1.7,8);
  car.position.set(6,0,6);
  updateUI();
  toast('LEVEL '+levelInfo(level).local+' — '+levelInfo(level).name);
}

function setupLevel() {
  theme=themes[levelInfo(level).act-1];
  scene.background=new THREE.Color(theme.sky);
  scene.fog=new THREE.FogExp2(theme.fog,theme.density);
  ground.material.color.set(theme.ground);
  buildCity();buildRoadDetails();
  if(!car)car=makeCar();
  resetLevel();
}

function toast(text) {
  const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);
}

function updateUI() {
  const info=levelInfo(level);
  document.getElementById('actName').textContent='ACT '+info.act+' — '+themes[info.act-1].name;
  document.getElementById('levelName').textContent='LEVEL '+info.local+' — '+info.name;
  document.getElementById('campaignCount').textContent=level+' / 250';
  document.getElementById('hudAct').textContent=info.act;
  document.getElementById('hudLevel').textContent=info.local+' / 50';
  document.getElementById('health').textContent=Math.max(0,Math.ceil(hp));
  document.getElementById('stamina').textContent=Math.ceil(stamina);
  document.getElementById('time').textContent=Math.floor(levelTime/60)+':'+String(Math.floor(levelTime%60)).padStart(2,'0');
  document.getElementById('objectiveTag').textContent=themes[info.act-1].name;
  document.getElementById('objective').textContent=info.act===2?'Reach the next safe zone.':info.act===3?'Search the abandoned district.':info.act===4?'Break through the DeadZone.':info.act===5?'Reach the last light.':'Survive the outbreak.';
  targetKills=Math.min(18,5+Math.floor(info.local/4)+info.act*2);
  document.getElementById('progress').textContent=levelKills+' / '+targetKills;
  document.getElementById('vehicleHud').classList.toggle('hidden',!inCar);
}

function shoot() {
  if(!started||!controls.isLocked||shootCooldown>0||levelComplete.classList.contains('hidden')===false)return;
  shootCooldown=.22;
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(zombies.flatMap(z=>z.children),true);
  if(hits.length){
    let z=hits[0].object;while(z.parent&&!zombies.includes(z))z=z.parent;
    if(zombies.includes(z)){
      z.userData.hp--;
      if(z.userData.hp<=0){removeZombie(z);levelKills++;kills++;}
    }
  }
  toast('SHOT');
}

function toggleVehicle() {
  if(!car)return;
  const dx=camera.position.x-car.position.x,dz=camera.position.z-car.position.z;
  const near=Math.hypot(dx,dz)<4.5;
  if(inCar||near){
    inCar=!inCar;
    document.getElementById('vehicleHud').classList.toggle('hidden',!inCar);
    toast(inCar?'VEHICLE ENTERED':'VEHICLE EXITED');
    if(inCar){camera.position.set(car.position.x,1.7,car.position.z);car.visible=false;}
    else {camera.position.x=car.position.x+2.8;camera.position.z=car.position.z;car.visible=true;}
  }
}

function movePlayer(dt) {
  const sprint=keys.shift&&stamina>1&&!inCar;
  const base=inCar?12:(sprint?8.5:4.5);
  if(sprint)stamina=Math.max(0,stamina-26*dt);else stamina=Math.min(100,stamina+18*dt);
  let x=(keys.d?1:0)-(keys.a?1:0),z=(keys.s?1:0)-(keys.w?1:0);
  const len=Math.hypot(x,z)||1;x/=len;z/=len;
  const dir=new THREE.Vector3(x,0,z);
  dir.applyQuaternion(camera.quaternion);dir.y=0;dir.normalize();
  const nx=camera.position.x+dir.x*base*dt,nz=camera.position.z+dir.z*base*dt;
  if(inCar){car.position.x=nx;car.position.z=nz;camera.position.x=nx;camera.position.z=nz;}
  else if(!blocked(nx,camera.position.z))camera.position.x=nx;
  if(!blocked(camera.position.x,nz))camera.position.z=nz;
  camera.position.y=1.7;
}

function updateZombies(dt) {
  for(const z of [...zombies]){
    const target=new THREE.Vector3(camera.position.x,0,camera.position.z);
    const dir=target.sub(new THREE.Vector3(z.position.x,0,z.position.z)).normalize();
    const speed=z.userData.speed*(inCar?.55:1);
    z.position.addScaledVector(dir,speed*dt);
    z.lookAt(camera.position.x,z.position.y,camera.position.z);
    const d=z.position.distanceTo(new THREE.Vector3(camera.position.x,0,camera.position.z));
    if(d<1.25){hp-=inCar?2.5:10;z.position.addScaledVector(dir,-1.5);}
  }
}

function gameTick(dt) {
  if(!started||!controls.isLocked)return;
  levelTime+=dt;shootCooldown=Math.max(0,shootCooldown-dt);
  movePlayer(dt);
  spawnTimer-=dt;
  const maxZombies=Math.min(12,4+levelInfo(level).act+Math.floor(levelInfo(level).local/10));
  if(spawnTimer<=0&&zombies.length<maxZombies&&levelKills<targetKills){spawnZombie();spawnTimer=Math.max(.55,1.7-levelInfo(level).local*.012);}
  updateZombies(dt);
  if(hp<=0){endRun();return;}
  if(levelKills>=targetKills){completeLevel();return;}
  updateUI();
}

function completeLevel(){
  controls.unlock();
  levelComplete.classList.remove('hidden');
  document.getElementById('completeTitle').textContent='LEVEL '+level;
  document.getElementById('completeText').textContent='Area secured in '+Math.floor(levelTime/60)+':'+String(Math.floor(levelTime%60)).padStart(2,'0')+'.';
}

function nextLevel(){
  if(level<250)level++; else level=1;
  levelComplete.classList.add('hidden');
  setupLevel();
  controls.lock();
}

function endRun(){
  controls.unlock();
  gameOver.classList.remove('hidden');
  document.getElementById('gameOverText').textContent='Level '+level+' ended after '+Math.floor(levelTime)+' seconds.';
}

function startGame(){
  started=true;menu.classList.add('hidden');hud.classList.remove('hidden');setupLevel();controls.lock();
}

document.getElementById('start').addEventListener('click',startGame);
document.getElementById('nextLevel').addEventListener('click',nextLevel);
document.getElementById('retry').addEventListener('click',()=>{gameOver.classList.add('hidden');setupLevel();controls.lock();});
renderer.domElement.addEventListener('click',()=>{if(started&&!controls.isLocked&&!levelComplete.classList.contains('hidden')===false&&!gameOver.classList.contains('hidden')===false)controls.lock();});
window.addEventListener('mousedown',e=>{if(e.button===0)shoot();});
window.addEventListener('keydown',e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.key.toLowerCase()==='e')toggleVehicle();
});
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
});

setupLevel();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  gameTick(dt);
  renderer.render(scene,camera);
}
animate();
