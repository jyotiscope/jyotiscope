import './styles.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

type Team = 'red' | 'blue';
type BodyMesh = { body: RAPIER.RigidBody; mesh: THREE.Object3D; kind: string; team?: Team };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

const ui = document.createElement('section');
ui.className = 'hud';
ui.innerHTML = `
  <div><strong>Jyotiscope Siege Toys</strong><span>Hot-seat physics prototype</span></div>
  <p id="turn">Loading physics…</p>
  <label>Power <input id="power" type="range" min="12" max="42" value="28" /></label>
  <label>Aim <input id="aim" type="range" min="-28" max="28" value="0" /></label>
  <button id="fire">Fire catapult</button>
  <button id="reset">Reset battlefield</button>
  <p class="hint">Goal: knock over the opponent's king. Watch what each brick does.</p>
`;
app.append(ui);

await RAPIER.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6dfb8);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 14, 18);
camera.lookAt(0, 1.7, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
app.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff6df, 0x7e6a54, 2.2));
const sun = new THREE.DirectionalLight(0xffdeb0, 3.2);
sun.position.set(-8, 12, 8);
sun.castShadow = true;
scene.add(sun);

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;
const objects: BodyMesh[] = [];
let activeTeam: Team = 'red';
let canFire = true;
let winner: Team | null = null;

const materials = {
  stone: new THREE.MeshStandardMaterial({ color: 0x9d968b, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9b6335, roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc74635, roughness: 0.72 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x3571c7, roughness: 0.72 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd5a638, roughness: 0.6 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x8ca86a, roughness: 1 }),
};

function addBody(mesh: THREE.Object3D, body: RAPIER.RigidBody, kind: string, team?: Team) {
  mesh.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
  scene.add(mesh);
  objects.push({ body, mesh, kind, team });
}

function box(size: THREE.Vector3, pos: THREE.Vector3, material: THREE.Material, mass = 1, kind = 'brick', team?: Team) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(pos);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
  body.setLinearDamping(0.18); body.setAngularDamping(0.22);
  world.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setDensity(mass).setFriction(0.92).setRestitution(0.16), body);
  addBody(mesh, body, kind, team);
}

function figure(team: Team, x: number, z: number, king = false) {
  const group = new THREE.Group();
  const mat = king ? materials.gold : materials[team];
  const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.62, 6, 12), mat);
  bodyMesh.position.y = 0.45; group.add(bodyMesh);
  if (king) { const crown = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.18, 5), materials.gold); crown.position.y = 0.98; group.add(crown); }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.45, z));
  body.setAngularDamping(0.35);
  world.createCollider(RAPIER.ColliderDesc.capsule(0.31, 0.18).setDensity(0.75).setFriction(0.8).setRestitution(0.2), body);
  addBody(group, body, king ? 'king' : 'soldier', team);
}

function buildCastle(team: Team, z: number) {
  const sx = team === 'red' ? -1 : 1;
  for (let y = 0; y < 3; y++) for (let i = -2; i <= 2; i++) box(new THREE.Vector3(0.95, 0.45, 0.55), new THREE.Vector3(i * 1.02, 0.25 + y * 0.48, z), materials.stone, 1.6, 'brick', team);
  for (const x of [-2.6, 2.6]) for (let y = 0; y < 4; y++) box(new THREE.Vector3(0.62, 0.48, 0.62), new THREE.Vector3(x, 0.26 + y * 0.51, z), materials.stone, 1.7, 'tower', team);
  box(new THREE.Vector3(5.9, 0.22, 0.42), new THREE.Vector3(0, 1.78, z), materials.wood, 0.7, 'beam', team);
  figure(team, 0, z + sx * 0.82, true);
  [-1.4, 1.4, -3.1, 3.1].forEach((x) => figure(team, x, z + sx * 1.15));
}

function createStaticWorld() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 14), materials.grass);
  floor.position.y = -0.2; floor.receiveShadow = true; scene.add(floor);
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.18, 7).setFriction(1.0), ground);
  box(new THREE.Vector3(1.2, 0.34, 1.2), new THREE.Vector3(-5.5, 0.05, -4.5), materials.wood, 0.9, 'catapult', 'red');
  box(new THREE.Vector3(1.2, 0.34, 1.2), new THREE.Vector3(5.5, 0.05, 4.5), materials.wood, 0.9, 'catapult', 'blue');
}

function reset() {
  for (const item of objects.splice(0)) { scene.remove(item.mesh); world.removeRigidBody(item.body); }
  activeTeam = 'red'; canFire = true; winner = null;
  buildCastle('red', -3.2); buildCastle('blue', 3.2);
  updateHud();
}

function fire() {
  if (!canFire || winner) return;
  canFire = false;
  const power = Number((document.querySelector('#power') as HTMLInputElement).value);
  const aim = THREE.MathUtils.degToRad(Number((document.querySelector('#aim') as HTMLInputElement).value));
  const dir = activeTeam === 'red' ? 1 : -1;
  const start = new THREE.Vector3(activeTeam === 'red' ? -5.5 : 5.5, 1.1, activeTeam === 'red' ? -4.5 : 4.5);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), materials.stone);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z));
  world.createCollider(RAPIER.ColliderDesc.ball(0.32).setDensity(4.2).setFriction(0.65).setRestitution(0.28), body);
  const velocity = new THREE.Vector3(Math.sin(aim) * 7, power * 0.55, dir * power);
  body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
  addBody(mesh, body, 'projectile', activeTeam);
  window.setTimeout(() => { if (!winner) { activeTeam = activeTeam === 'red' ? 'blue' : 'red'; canFire = true; updateHud(); } }, 3600);
}

function updateHud() {
  const turn = document.querySelector('#turn') as HTMLParagraphElement;
  turn.textContent = winner ? `${winner.toUpperCase()} wins! The rival king toppled.` : `${activeTeam.toUpperCase()} player: aim the catapult, fire, and let physics decide.`;
}

function checkKings() {
  for (const item of objects.filter((o) => o.kind === 'king')) {
    const up = item.body.rotation();
    const tipped = Math.abs(up.x) + Math.abs(up.z) > 0.65 || item.body.translation().y < 0.12;
    if (tipped && !winner) { winner = item.team === 'red' ? 'blue' : 'red'; updateHud(); }
  }
}

createStaticWorld(); reset();
(document.querySelector('#fire') as HTMLButtonElement).addEventListener('click', fire);
(document.querySelector('#reset') as HTMLButtonElement).addEventListener('click', reset);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

function animate() {
  requestAnimationFrame(animate);
  world.step();
  for (const item of objects) { const p = item.body.translation(); const r = item.body.rotation(); item.mesh.position.set(p.x, p.y, p.z); item.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
  checkKings();
  renderer.render(scene, camera);
}
animate();
