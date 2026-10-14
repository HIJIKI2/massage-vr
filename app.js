// マッサージルーム。主観移動 + コントローラー / ハンドトラッキング。
import * as THREE from 'three';
window.__appBoot = true;
{
  const bootInfo = document.getElementById('info');
  const bootBtn = document.getElementById('vrbtn');
  if (bootInfo) bootInfo.textContent = '部屋を準備しています…';
  if (bootBtn) bootBtn.textContent = '準備中…';
}
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { createMaterials } from './src/materials.js';
import { buildRoom, BED_TOP } from './src/room.js';
import { createWoman } from './src/body.js';
import { createFace } from './src/face.js';
import { createOutfits, applyWear, hasPiece } from './src/clothing.js';
import { createPanel } from './src/panel.js';
import { makeSoft } from './src/soft.js';
import { loadHand, loadTrackedHand, gripPose } from './src/handmodel.js';
import { loadCharacter, layCharacter, applyClothes, applyPose, applyPosePreset, listVrmFiles } from './src/ccbody.js';

const qs = new URLSearchParams(location.search);
const lockMood = qs.get('lockmood') === '1';
const PART_LABEL = { head: '頭', top: '上半身', bottom: '下半身', innerTop: '下着（上）', innerBottom: '下着（下）', legs: '脚' };

const state = {
  outfit: 'nurse',
  pose: 'supine',
  worn: { head: true, top: true, bottom: true, innerTop: true, innerBottom: true, legs: true },
  clothOn: {},
  oil: false,
  ease: 0.08,
  tension: 0,
  gaze: new THREE.Vector3(0, 1.6, 0.8),
  joints: false,
  vrm: '',
  vrmName: '',
  vrmAuthors: '',
};
if (['nurse', 'ol', 'sailor', 'bikini'].includes(qs.get('outfit'))) state.outfit = qs.get('outfit');
if (['supine', 'prone', 'missionary', 'doggy', 'cowgirl'].includes(qs.get('pose'))) state.pose = qs.get('pose');
if (qs.get('undress') === '1') Object.keys(state.worn).forEach(k => { state.worn[k] = false; });
if (qs.get('ease')) state.ease = Number(qs.get('ease')) || 0;
if (qs.get('oil') === '1') state.oil = true;
const demoPress = qs.get('press') === '1';
const shot = qs.get('shot') === '1';
if (shot) document.title = 'LOAD';

const errBox = document.getElementById('err');
window.addEventListener('error', e => { errBox.textContent += (e.message || e.error) + '\n'; });
window.addEventListener('unhandledrejection', e => { errBox.textContent += String(e.reason) + '\n'; });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141210);
scene.fog = new THREE.Fog(0x141210, 4.2, 8.5);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 30);
camera.position.set(0, 1.42, 0);
camera.rotation.x = -0.78;
const dolly = new THREE.Group();
dolly.add(camera);
dolly.position.set(0.78, 0.2, 0.95);
dolly.rotation.y = 0.78;
scene.add(dolly);

scene.add(new THREE.HemisphereLight(0x8a8178, 0x2a2118, 0.38));
scene.add(new THREE.AmbientLight(0xffe6d0, 0.05));
const spot = new THREE.SpotLight(0xfff1dd, 6, 6, 0.9, 0.7, 2);
spot.position.set(0.35, 2.35, 0.15);
spot.target.position.set(0, 0.9, 0.1);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.camera.near = 0.4;
spot.shadow.camera.far = 5;
spot.shadow.bias = -0.00015;
spot.shadow.normalBias = 0.045;
scene.add(spot, spot.target);
const lamp = new THREE.PointLight(0xffc98a, 1.2, 3.2, 2);
lamp.position.set(1.05, 0.85, -0.5);
scene.add(lamp);

const mats = createMaterials();
const room = buildRoom();
scene.add(room.group);
const woman = createWoman(mats);
scene.add(woman.root);
let cc = null;
const face = createFace(mats, woman.root);
const outfits = createOutfits(mats, woman);
const panel = createPanel(key => hasPiece(outfits, state.outfit, key));
scene.add(panel.group);

const deformers = [];
for (const m of woman.flesh) deformers.push(makeSoft(m));
for (const o of Object.values(outfits)) for (const m of o.shells) deformers.push(makeSoft(m));

const cursorMat = mats.skinPlain.clone();
const cursor = new THREE.Group();
const palm = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), cursorMat);
palm.scale.set(1.05, 0.55, 1.25);
cursor.add(palm);
for (let i = 0; i < 4; i++) {
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), cursorMat);
  f.scale.set(1, 1, 2.2);
  f.position.set((i - 1.5) * 0.014, -0.012, -0.045);
  cursor.add(f);
}
const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), cursorMat);
thumb.position.set(0.03, -0.008, -0.02);
cursor.add(thumb);
scene.add(cursor);

let targets = [];
function rebuildTargets() {
  if (cc) {
    targets = [room.bottle, panel.mesh, ...panel.mesh.children];
    if (cc.bodies) targets.push(...cc.bodies);
    if (cc.faces) targets.push(...cc.faces);
    return;
  }
  targets = [...woman.flesh, room.bottle, panel.mesh, ...panel.mesh.children];
  for (const o of Object.values(outfits)) for (const m of o.shells) targets.push(m);
}
function placeBody() {
  const prone = state.pose === 'prone' || state.pose === 'doggy';
  if (cc) {
    layCharacter(cc, BED_TOP);
    return;
  }
  woman.root.rotation.z = prone ? Math.PI : 0;
  const lift = prone ? woman.bounds.maxY : -woman.bounds.minY;
  woman.root.position.set(0, BED_TOP + lift + 0.012, 0.02);
  woman.root.updateMatrixWorld(true);
}
function refreshClothes() {
  if (cc) {
    applyClothes(cc, state.clothOn);
    rebuildTargets();
    return;
  }
  const covered = applyWear(outfits, state.outfit, state.worn);
  for (const n of woman.nipples) n.visible = !covered;
  for (const a of woman.areolae) a.visible = !covered;
  rebuildTargets();
}
function resetWorn() {
  for (const k of Object.keys(state.worn)) state.worn[k] = true;
  state.clothOn = {};
}
function onButton(id) {
  if (id.startsWith('outfit:')) {
    state.outfit = id.slice(7);
    resetWorn();
  } else if (id.startsWith('pose:')) {
    state.pose = id.slice(5);
    if (cc) applyPosePreset(cc, state.pose);
  }
  else if (id === 'vrm:prev' || id === 'vrm:next') {
    cycleVrm(id === 'vrm:next' ? 1 : -1);
    return;
  }
  else if (id.startsWith('vrm:')) {
    showCharacter(id.slice(4));
    return;
  }
  else if (id === 'oil') state.oil = !state.oil;
  else if (id === 'joints') {
    state.joints = !state.joints;
    syncUI(true);
    updateMarkers();
    return;
  }
  else if (id.startsWith('part:')) {
    const key = id.slice(5);
    if (cc) return;
    if (!hasPiece(outfits, state.outfit, key)) return;
    state.worn[key] = !state.worn[key];
  } else if (id.startsWith('cloth:')) {
    const key = id.slice(6);
    if (!cc || !cc.clothes.some(piece => piece.id === key)) return;
    state.clothOn[key] = state.clothOn[key] === false;
  } else if (id === 'all:on') resetWorn();
  else if (id === 'all:off') {
    if (cc) for (const piece of cc.clothes) state.clothOn[piece.id] = false;
    else for (const k of Object.keys(state.worn)) state.worn[k] = false;
  }
  else if (id === 'reset') resetAll();
  placeBody();
  refreshClothes();
  syncUI(true);
}
function resetAll() {
  state.outfit = 'nurse';
  state.pose = 'supine';
  state.oil = false;
  state.joints = false;
  if (cc) applyPosePreset(cc, 'supine');
  if (!lockMood) { state.ease = 0.08; state.tension = 0; }
  resetWorn();
  room.bottle.position.copy(room.bottleHome);
  room.bottle.quaternion.identity();
  for (const d of deformers) d.reset();
  for (const cs of controllers) cs.holdingOil = false;
  placeBody();
  refreshClothes();
  syncUI(true);
}

const lastPress = new Map();
function fire(id) {
  const now = performance.now();
  if (now - (lastPress.get(id) || 0) < 380) return;
  lastPress.set(id, now);
  onButton(id);
}

function moodText() {
  if (state.tension > 0.42 && state.tension > state.ease) return '少し身を強張らせている';
  if (state.ease > 0.72) return '頬を染めて、力が抜けている';
  if (state.ease > 0.45) return '目を細めて、気持ちよさそう';
  if (state.ease > 0.22) return '触れて、少し力が抜けてきた';
  return '落ち着いている';
}
const moodEl = document.getElementById('mood');
const meterEl = document.querySelector('#meter > div');
const infoEl = document.getElementById('info');
let clothSig = '';
function renderClothes() {
  const box = document.getElementById('clothlist');
  const allRow = document.getElementById('clothall');
  if (!box) return;
  const pieces = cc ? cc.clothes : null;
  const sig = pieces
    ? 'vrm:' + pieces.map(p => p.id + (state.clothOn[p.id] === false ? '0' : '1') + p.label).join('|')
    : 'body:' + state.outfit + ':' + Object.entries(state.worn).map(([k, v]) => k + (v ? '1' : '0')).join(',');
  if (sig === clothSig) return;
  clothSig = sig;
  box.replaceChildren();
  if (pieces) {
    if (allRow) allRow.hidden = pieces.length === 0;
    if (!pieces.length) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'このモデルに着脱できる衣装はありません。';
      box.appendChild(note);
      return;
    }
    for (const piece of pieces) {
      const on = state.clothOn[piece.id] !== false;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cloth = piece.id;
      button.textContent = `${piece.label}　${on ? '着用中' : '脱いでいる'}`;
      button.classList.toggle('on', on);
      box.appendChild(button);
    }
    return;
  }
  if (allRow) allRow.hidden = false;
  for (const [key, label] of Object.entries(PART_LABEL)) {
    const ok = hasPiece(outfits, state.outfit, key);
    const on = !!state.worn[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.part = key;
    button.disabled = !ok;
    button.textContent = ok ? `${label}　${on ? '着用中' : '脱いでいる'}` : `${label}　なし`;
    button.classList.toggle('on', ok && on);
    box.appendChild(button);
  }
}

function syncUI(force) {
  document.querySelectorAll('[data-outfit]').forEach(b => {
    b.disabled = !!cc;
    b.classList.toggle('on', !cc && b.dataset.outfit === state.outfit);
  });
  document.querySelectorAll('[data-pose]').forEach(b => b.classList.toggle('on', b.dataset.pose === state.pose));
  document.querySelectorAll('[data-vrm]').forEach(b => b.classList.toggle('on', b.dataset.vrm === state.vrm));
  document.getElementById('oilbtn').classList.toggle('on', state.oil);
  document.getElementById('jointbtn').classList.toggle('on', state.joints);
  state.clothes = cc ? cc.clothes : null;
  renderClothes();
  moodEl.textContent = moodText();
  meterEl.style.width = `${Math.round(THREE.MathUtils.clamp(state.ease, 0, 1) * 100)}%`;
  const oil = state.oil ? 'オイルあり' : 'オイルなし';
  const credit = cc
    ? (state.vrmAuthors ? `モデル「${state.vrmName}」（${state.vrmAuthors}）。　` : `モデル「${state.vrmName}」。　`)
    : '';
  const poseHelp = state.joints
    ? '関節モードです。目印をつかむと、手の位置に合わせて腕を動かしたり足を開いたり、肘と膝をその角度まで曲げたりできます。'
    : 'PC: 左ドラッグでマッサージ（Shiftで揉む） / 右ドラッグで視点。';
  infoEl.textContent = `${credit}${poseHelp}　VR: 関節モードでグリップかA/X（手の追跡は親指と中指）を押したまま目印を持ちます。トリガーはマッサージです。B/Y長押しで戻します。　${oil}`;
  panel.draw(state, moodText());
  if (force) cursorMat.roughness = state.oil ? 0.18 : 0.48;
  cursorMat.clearcoat = state.oil ? 0.7 : 0.05;
}

document.getElementById('dock').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vrm) { showCharacter(b.dataset.vrm); return; }
  if (b.id === 'vrmrefresh') { refreshVrmList(true); return; }
  if (b.dataset.cloth) fire('cloth:' + b.dataset.cloth);
  else if (b.dataset.outfit) fire('outfit:' + b.dataset.outfit);
  else if (b.dataset.pose) fire('pose:' + b.dataset.pose);
  else if (b.dataset.part) fire('part:' + b.dataset.part);
  else if (b.dataset.all) fire('all:' + b.dataset.all);
  else if (b.id === 'oilbtn') fire('oil');
  else if (b.id === 'jointbtn') fire('joints');
  else if (b.id === 'resetbtn') resetAll();
});

placeBody();
refreshClothes();
syncUI(true);

const clock = new THREE.Clock();
const keys = {};
const mouse = new THREE.Vector2(-2, -2);
const raycaster = new THREE.Raycaster();
let massaging = false;
let looking = false;
let lookX = 0, lookY = 0;
let lastBreath = 0;
const contacts = [];
const prevPos = new Map();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const qA = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const controllers = [];

function addContact(id, x, y, z, radius, pressure, oil, squeeze, dt) {
  let prev = prevPos.get(id);
  if (!prev) { prev = new THREE.Vector3(x, y, z); prevPos.set(id, prev); }
  const slide = vA.set(x, y, z).distanceTo(prev) / Math.max(dt, 1e-4);
  prev.set(x, y, z);
  contacts.push({ id, x, y, z, radius, pressure, oil: !!(oil || state.oil), squeeze: !!squeeze, slide, hit: 0, softHit: 0 });
}

function setupControllers() {
  const relax = { thumb: 0.25, index: 0.3, middle: 0.38, ring: 0.42, pinky: 0.48 };
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const xrHand = renderer.xr.getHand(i);
    const hands = {};
    for (const side of ['right', 'left']) {
      const h = loadHand(side, mats.skinPlain);
      const pose = gripPose(side);
      h.group.quaternion.copy(pose.quaternion);
      h.group.position.copy(pose.position);
      h.ready.then(() => h.setCurl(relax));
      const holder = new THREE.Group();
      holder.add(h.group);
      grip.add(holder);
      const tracked = loadTrackedHand(side, mats.skinPlain);
      tracked.group.visible = false;
      xrHand.add(tracked.group);
      hands[side] = { api: h, holder, tracked };
    }
    const cs = {
      ctrl, grip, xrHand, hands,
      side: i === 0 ? 'right' : 'left',
      tracked: false, inputSource: null, select: false, squeeze: false,
      holdingOil: false, turned: false, byHold: 0, hapticT: 0,
      poseJoint: null, poseHeld: false, poseLast: new THREE.Vector3(),
    };
    const show = () => {
      for (const s of ['right', 'left']) {
        cs.hands[s].holder.visible = s === cs.side && !cs.tracked;
        cs.hands[s].tracked.group.visible = s === cs.side && cs.tracked;
      }
    };
    cs.show = show;
    ctrl.addEventListener('connected', e => {
      cs.inputSource = e.data;
      cs.tracked = !!e.data.hand;
      cs.side = e.data.handedness === 'left' ? 'left' : 'right';
      show();
    });
    ctrl.addEventListener('disconnected', () => { cs.inputSource = null; cs.tracked = false; show(); });
    ctrl.addEventListener('selectstart', () => { cs.select = true; });
    ctrl.addEventListener('selectend', () => { cs.select = false; cs.holdingOil = false; });
    ctrl.addEventListener('squeezestart', () => { cs.squeeze = true; });
    ctrl.addEventListener('squeezeend', () => { cs.squeeze = false; });
    dolly.add(ctrl, grip, xrHand);
    controllers.push(cs);
    show();
  }
}

function haptic(cs, amp) {
  const gp = cs.inputSource?.gamepad;
  if (!gp) return;
  const h = gp.hapticActuators?.[0];
  if (h?.pulse) h.pulse(amp, 30);
  else gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: 30, strongMagnitude: amp, weakMagnitude: amp * 0.6 });
}

function updateLocomotion(cs, gp, dt) {
  const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
  const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
  if (ax === undefined) return;
  if (cs.side === 'left') {
    if (Math.abs(ax) < 0.15 && Math.abs(ay) < 0.15) return;
    camera.getWorldDirection(vA); vA.y = 0; vA.normalize();
    vB.crossVectors(vA, yAxis);
    dolly.position.addScaledVector(vA, -ay * dt * 1.15).addScaledVector(vB, ax * dt * 1.15);
  } else {
    if (Math.abs(ax) > 0.7) {
      if (!cs.turned) {
        cs.turned = true;
        const before = camera.getWorldPosition(vC);
        dolly.rotateY(ax > 0 ? -Math.PI / 6 : Math.PI / 6);
        dolly.updateMatrixWorld(true);
        const after = camera.getWorldPosition(vD);
        dolly.position.add(before.sub(after));
      }
    } else if (Math.abs(ax) < 0.3) cs.turned = false;
    if (Math.abs(ay) > 0.2) dolly.position.y = THREE.MathUtils.clamp(dolly.position.y - ay * dt * 0.45, -0.45, 0.55);
  }
}

function avoidSolids() {
  dolly.position.x = THREE.MathUtils.clamp(dolly.position.x, -2.15, 2.15);
  dolly.position.z = THREE.MathUtils.clamp(dolly.position.z, -2.15, 2.15);
  const minX = -0.5, maxX = 0.5, minZ = -1.12, maxZ = 1.08;
  const x = dolly.position.x, z = dolly.position.z;
  if (x > minX && x < maxX && z > minZ && z < maxZ) {
    const d = [x - minX, maxX - x, z - minZ, maxZ - z];
    const m = Math.min(...d);
    if (m === d[0]) dolly.position.x = minX;
    else if (m === d[1]) dolly.position.x = maxX;
    else if (m === d[2]) dolly.position.z = minZ;
    else dolly.position.z = maxZ;
  }
}

function desktopMove(dt) {
  if (renderer.xr.isPresenting) return;
  camera.getWorldDirection(vA); vA.y = 0; if (vA.lengthSq() < 1e-6) vA.set(0, 0, -1); vA.normalize();
  vB.crossVectors(vA, yAxis).normalize();
  const sp = keys.ShiftLeft || keys.ShiftRight ? 1.8 : 1.15;
  if (keys.KeyW) dolly.position.addScaledVector(vA, sp * dt);
  if (keys.KeyS) dolly.position.addScaledVector(vA, -sp * dt);
  if (keys.KeyA) dolly.position.addScaledVector(vB, -sp * dt);
  if (keys.KeyD) dolly.position.addScaledVector(vB, sp * dt);
  if (keys.KeyQ) dolly.rotation.y += dt * 1.2;
  if (keys.KeyE) dolly.rotation.y -= dt * 1.2;
}

function setMouse(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
function cast() {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(targets, false);
}
function placeCursor(hit, press) {
  const n = hit.face?.normal ? vA.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize() : vA.set(0, 1, 0);
  const sink = press ? 0.018 + ((keys.ShiftLeft || keys.ShiftRight) ? 0.012 : 0) : 0.004;
  cursor.position.copy(hit.point).addScaledVector(n, 0.02 - sink);
  qA.setFromUnitVectors(yAxis, n);
  cursor.quaternion.copy(qA);
}
function pushCursorContacts(dt, press) {
  if (!press) return;
  const hard = keys.ShiftLeft || keys.ShiftRight;
  const spots = [[0, -0.01, 0, 0.036], [-0.018, -0.012, -0.04, 0.014], [0, -0.012, -0.048, 0.014], [0.018, -0.012, -0.04, 0.014]];
  spots.forEach((s, i) => {
    vB.set(s[0], s[1], s[2]).applyMatrix4(cursor.matrixWorld);
    addContact('mouse' + i, vB.x, vB.y, vB.z, s[3], hard ? 1.55 : 1.05, state.oil, hard, dt);
  });
}

const MARKER_DEFS = [
  { id: 'leftUpperArm', from: 'leftUpperArm', to: 'leftLowerArm', t: 0.42, color: 0xf2c14e },
  { id: 'leftElbow', from: 'leftLowerArm', to: 'leftHand', t: 0.28, color: 0xe07a3d },
  { id: 'rightUpperArm', from: 'rightUpperArm', to: 'rightLowerArm', t: 0.42, color: 0xf2c14e },
  { id: 'rightElbow', from: 'rightLowerArm', to: 'rightHand', t: 0.28, color: 0xe07a3d },
  { id: 'leftHip', from: 'leftUpperLeg', to: 'leftLowerLeg', t: 0.38, color: 0x7ec8c3 },
  { id: 'leftKnee', from: 'leftLowerLeg', to: 'leftFoot', t: 0.22, color: 0xe7a3b0 },
  { id: 'rightHip', from: 'rightUpperLeg', to: 'rightLowerLeg', t: 0.38, color: 0x7ec8c3 },
  { id: 'rightKnee', from: 'rightLowerLeg', to: 'rightFoot', t: 0.22, color: 0xe7a3b0 },
];
const markerGroup = new THREE.Group();
markerGroup.name = 'joint-markers';
markerGroup.visible = false;
const markerHits = [];
for (const def of MARKER_DEFS) {
  const g = new THREE.Group();
  g.userData.joint = def.id;
  g.userData.from = def.from;
  g.userData.to = def.to;
  g.userData.t = def.t;
  const mat = new THREE.MeshBasicMaterial({ color: def.color, toneMapped: false });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), mat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 22), mat));
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.userData.joint = def.id;
  g.add(hit);
  markerHits.push(hit);
  markerGroup.add(g);
}
scene.add(markerGroup);
const posePoint = new THREE.Vector3();
const poseA = new THREE.Vector3();
const poseB = new THREE.Vector3();
let posing = false;
let poseJoint = null;
let poseSX = 0;
let poseSY = 0;

function markersWanted() {
  return !!(cc && (state.joints || controllers.some(c => c.poseHeld)));
}

function updateMarkers() {
  const show = markersWanted();
  markerGroup.visible = show;
  if (!cc) return;
  const active = poseJoint || controllers.find(c => c.poseJoint)?.poseJoint || null;
  camera.getWorldPosition(posePoint);
  const human = cc.vrm.humanoid;
  for (const g of markerGroup.children) {
    const from = human?.getRawBoneNode(g.userData.from);
    const to = human?.getRawBoneNode(g.userData.to);
    if (!from || !to) continue;
    from.getWorldPosition(poseA);
    to.getWorldPosition(poseB);
    g.position.lerpVectors(poseA, poseB, g.userData.t);
    g.position.y += 0.04;
    g.lookAt(posePoint);
    g.scale.setScalar(g.userData.joint === active ? 1.45 : 1);
  }
  markerGroup.updateMatrixWorld(true);
}

function nearestMarker(point, maxDist) {
  if (!markerGroup.visible) return null;
  let best = null;
  let bestD = maxDist;
  for (const g of markerGroup.children) {
    const d = g.position.distanceTo(point);
    if (d < bestD) { bestD = d; best = g.userData.joint; }
  }
  return best;
}

function clampPose(p) {
  const c = THREE.MathUtils.clamp;
  p.leftUpperArm = c(p.leftUpperArm, -0.8, 2.6);
  p.rightUpperArm = c(p.rightUpperArm, -0.8, 2.6);
  p.leftArmLift = c(p.leftArmLift, -1.6, 2.6);
  p.rightArmLift = c(p.rightArmLift, -1.6, 2.6);
  p.leftElbow = c(p.leftElbow, -0.35, 2.95);
  p.rightElbow = c(p.rightElbow, -0.35, 2.95);
  p.leftHip = c(p.leftHip, -1.15, 2.6);
  p.rightHip = c(p.rightHip, -1.15, 2.6);
  p.leftKnee = c(p.leftKnee, 0, 2.9);
  p.rightKnee = c(p.rightKnee, 0, 2.9);
  p.leftSpread = c(p.leftSpread, -1.25, 2.05);
  p.rightSpread = c(p.rightSpread, -1.25, 2.05);
}

const POSE_AXES = {
  leftUpperArm: ['leftUpperArm', 'leftArmLift'],
  rightUpperArm: ['rightUpperArm', 'rightArmLift'],
  leftElbow: ['leftElbow'],
  rightElbow: ['rightElbow'],
  leftHip: ['leftHip', 'leftSpread'],
  rightHip: ['rightHip', 'rightSpread'],
};
const poseSolveCur = new THREE.Vector3();
const poseSolveNxt = new THREE.Vector3();
const poseSolveErr = new THREE.Vector3();
const poseFootCur = new THREE.Vector3();
const poseFootNxt = new THREE.Vector3();
const poseFootErr = new THREE.Vector3();
const poseJ0 = new THREE.Vector3();
const poseJ1 = new THREE.Vector3();
const poseJ2 = new THREE.Vector3();
const poseF0 = new THREE.Vector3();
const poseF1 = new THREE.Vector3();
const poseF2 = new THREE.Vector3();
const footAnchor = new THREE.Vector3();
let kneeHeld = null;

function limbPoint(id, target) {
  const g = markerGroup.children.find(child => child.userData.joint === id);
  const human = cc?.vrm?.humanoid;
  if (!g || !human) return target.set(0, 0, 0);
  const from = human.getRawBoneNode(g.userData.from);
  const to = human.getRawBoneNode(g.userData.to);
  if (!from || !to) return target.set(0, 0, 0);
  from.getWorldPosition(poseA);
  to.getWorldPosition(poseB);
  return target.lerpVectors(poseA, poseB, g.userData.t);
}

function solve3(m, b, out) {
  const a = [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]],
  ];
  const e = [b[0], b[1], b[2]];
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[piv][i])) piv = r;
    if (piv !== i) {
      const row = a[i]; a[i] = a[piv]; a[piv] = row;
      const t = e[i]; e[i] = e[piv]; e[piv] = t;
    }
    const d = a[i][i] || 1e-6;
    for (let r = i + 1; r < 3; r++) {
      const f = a[r][i] / d;
      for (let c = i; c < 3; c++) a[r][c] -= f * a[i][c];
      e[r] -= f * e[i];
    }
  }
  for (let i = 2; i >= 0; i--) {
    let s = e[i];
    for (let c = i + 1; c < 3; c++) s -= a[i][c] * out[c];
    out[i] = THREE.MathUtils.clamp(s / (a[i][i] || 1e-6), -0.55, 0.55);
  }
}

function followJoint(id, hand) {
  if (/Knee$/.test(id)) return followKnee(id, hand);
  const keys = POSE_AXES[id];
  if (!cc?.pose || !keys) return;
  if (/Arm|Elbow/.test(id)) cc.keepArms = true;
  const p = cc.pose;
  const cols = [poseJ0, poseJ1];
  const eps = 0.06;
  for (let iter = 0; iter < 6; iter++) {
    applyPose(cc);
    limbPoint(id, poseSolveCur);
    poseSolveErr.copy(hand).sub(poseSolveCur);
    if (poseSolveErr.lengthSq() < 0.00012) break;
    const saved = keys.map(key => p[key]);
    for (let i = 0; i < keys.length; i++) {
      p[keys[i]] = saved[i] + eps;
      clampPose(p);
      applyPose(cc);
      limbPoint(id, poseSolveNxt);
      cols[i].copy(poseSolveNxt).sub(poseSolveCur).multiplyScalar(1 / eps);
      p[keys[i]] = saved[i];
    }
    const damp = 0.015;
    let s0 = 0;
    let s1 = 0;
    if (keys.length === 1) {
      s0 = THREE.MathUtils.clamp(cols[0].dot(poseSolveErr) / (cols[0].lengthSq() + damp), -0.9, 0.9);
    } else {
      const a = cols[0].lengthSq() + damp;
      const b = cols[0].dot(cols[1]);
      const c = cols[1].lengthSq() + damp;
      const e0 = cols[0].dot(poseSolveErr);
      const e1 = cols[1].dot(poseSolveErr);
      const det = a * c - b * b || 1e-4;
      s0 = THREE.MathUtils.clamp((c * e0 - b * e1) / det, -0.9, 0.9);
      s1 = THREE.MathUtils.clamp((a * e1 - b * e0) / det, -0.9, 0.9);
    }
    p[keys[0]] = saved[0] + s0;
    if (keys[1]) p[keys[1]] = saved[1] + s1;
    clampPose(p);
  }
  applyPose(cc);
  updateMarkers();
}

function followKnee(id, hand) {
  if (!cc?.pose) return;
  const side = id.startsWith('left') ? 'left' : 'right';
  const hipKeys = [side + 'Hip', side + 'Spread'];
  const kneeKey = side + 'Knee';
  const foot = cc.vrm?.humanoid?.getRawBoneNode(side + 'Foot');
  if (!foot) return;
  if (kneeHeld !== id) {
    applyPose(cc);
    foot.getWorldPosition(footAnchor);
    kneeHeld = id;
  }
  const p = cc.pose;
  const cols = [poseJ0, poseJ1];
  const eps = 0.06;
  for (let outer = 0; outer < 5; outer++) {
    for (let iter = 0; iter < 4; iter++) {
      applyPose(cc);
      limbPoint(id, poseSolveCur);
      poseSolveErr.copy(hand).sub(poseSolveCur);
      if (poseSolveErr.lengthSq() < 0.0002) break;
      const saved = hipKeys.map(key => p[key]);
      for (let i = 0; i < 2; i++) {
        p[hipKeys[i]] = saved[i] + eps;
        clampPose(p);
        applyPose(cc);
        limbPoint(id, poseSolveNxt);
        cols[i].copy(poseSolveNxt).sub(poseSolveCur).multiplyScalar(1 / eps);
        p[hipKeys[i]] = saved[i];
      }
      const damp = 0.004;
      const a = cols[0].lengthSq() + damp;
      const b = cols[0].dot(cols[1]);
      const c = cols[1].lengthSq() + damp;
      const e0 = cols[0].dot(poseSolveErr);
      const e1 = cols[1].dot(poseSolveErr);
      const det = a * c - b * b || 1e-5;
      p[hipKeys[0]] = saved[0] + THREE.MathUtils.clamp((c * e0 - b * e1) / det, -0.5, 0.5);
      p[hipKeys[1]] = saved[1] + THREE.MathUtils.clamp((a * e1 - b * e0) / det, -0.5, 0.5);
      clampPose(p);
    }
    applyPose(cc);
    foot.getWorldPosition(poseFootCur);
    poseFootErr.copy(footAnchor).sub(poseFootCur);
    if (poseFootErr.lengthSq() < 0.0004) continue;
    const savedKnee = p[kneeKey];
    p[kneeKey] = savedKnee + 0.08;
    clampPose(p);
    applyPose(cc);
    foot.getWorldPosition(poseFootNxt);
    poseF0.copy(poseFootNxt).sub(poseFootCur).multiplyScalar(1 / 0.08);
    const step = THREE.MathUtils.clamp(poseF0.dot(poseFootErr) / (poseF0.lengthSq() + 0.0008), -0.55, 0.55);
    p[kneeKey] = savedKnee + step;
    clampPose(p);
  }
  applyPose(cc);
  updateMarkers();
}

const FINGER_JOINTS = [
  ['thumb', 'thumb-tip', 0.018],
  ['index', 'index-finger-tip', 0.016],
  ['index', 'index-finger-phalanx-distal', 0.014],
  ['middle', 'middle-finger-tip', 0.016],
  ['middle', 'middle-finger-phalanx-distal', 0.014],
  ['ring', 'ring-finger-tip', 0.015],
  ['pinky', 'pinky-finger-tip', 0.014],
];

function gatherHands(dt) {
  let oilHeld = false;
  for (const cs of controllers) {
    const tracked = !!(cs.inputSource && cs.inputSource.hand);
    if (tracked !== cs.tracked) { cs.tracked = tracked; cs.show(); }
    const gp = cs.inputSource?.gamepad;
    if (gp && !tracked) {
      if (gp.buttons[0]) cs.select = !!gp.buttons[0].pressed;
      if (gp.buttons[1]) cs.squeeze = !!gp.buttons[1].pressed;
      const menu = gp.buttons[5]?.pressed;
      if (menu) { cs.byHold += dt; if (cs.byHold > 1) { cs.byHold = -3; resetAll(); } }
      else cs.byHold = Math.max(0, cs.byHold);
      updateLocomotion(cs, gp, dt);
    } else if (tracked) {
      cs.squeeze = false;
    }
    const pinching = tracked && !!cs.xrHand.inputState?.pinching;
    if (tracked) cs.hands[cs.side].tracked.update(cs.xrHand);
    else {
      const curl = cs.squeeze ? 0.9 : cs.select ? 0.62 : 0.24;
      cs.hands[cs.side].api.setCurl({
        thumb: cs.squeeze ? 0.55 : 0.3,
        index: curl, middle: curl, ring: curl * 0.92, pinky: curl * 0.84,
      });
    }
    const pts = [];
    if (tracked) {
      const joints = cs.xrHand.joints || {};
      for (const [name, jointName, radius] of FINGER_JOINTS) {
        const joint = joints[jointName];
        if (!joint || !joint.visible) continue;
        joint.getWorldPosition(vC);
        pts.push([name + jointName, vC.x, vC.y, vC.z, radius]);
      }
      const wrist = joints.wrist;
      const mid = joints['middle-finger-metacarpal'];
      if (wrist && mid && wrist.visible && mid.visible) {
        wrist.getWorldPosition(vC);
        mid.getWorldPosition(vD);
        vC.add(vD).multiplyScalar(0.5);
        pts.push(['palm', vC.x, vC.y, vC.z, 0.04]);
      }
    } else if (cs.inputSource) {
      const api = cs.hands[cs.side].api;
      cs.grip.getWorldPosition(vC);
      pts.push(['palm', vC.x, vC.y, vC.z, 0.038]);
      if (api.tips) {
        for (const [name, tip] of Object.entries(api.tips)) {
          if (!tip) continue;
          tip.getWorldPosition(vD);
          pts.push([name, vD.x, vD.y, vD.z, name === 'thumb' ? 0.018 : 0.016]);
        }
      }
    }
    const thumbMid = tracked && (() => {
      const thumbTip = (cs.xrHand.joints || {})['thumb-tip'];
      const midTip = (cs.xrHand.joints || {})['middle-finger-tip'];
      if (!thumbTip?.visible || !midTip?.visible) return false;
      thumbTip.getWorldPosition(vC);
      midTip.getWorldPosition(vD);
      return vC.distanceTo(vD) < 0.022;
    })();
    const wantGrab = state.joints && (
      (!tracked && (!!gp?.buttons[1]?.pressed || !!gp?.buttons[4]?.pressed)) || thumbMid
    );
    if (wantGrab) {
      updateMarkers();
      const wrist = tracked ? cs.xrHand.joints?.wrist : null;
      if (wrist?.visible) wrist.getWorldPosition(posePoint);
      else cs.grip.getWorldPosition(posePoint);
      if (!cs.poseJoint) {
        cs.poseJoint = nearestMarker(posePoint, 0.18);
        if (cs.poseJoint && cs.poseJoint === kneeHeld) kneeHeld = null;
      }
      if (cs.poseJoint) followJoint(cs.poseJoint, posePoint);
    } else {
      if (cs.poseJoint && cs.poseJoint === kneeHeld) kneeHeld = null;
      cs.poseJoint = null;
    }
    const posingHand = !!(wantGrab && cs.poseJoint);
    cs.poseHeld = posingHand;
    const knead = cs.squeeze || pinching;
    const press = cs.select || pinching;
    const palmPt = pts.find(p => p[0] === 'palm') || pts[0];
    if (posingHand) continue;
    if (palmPt && press) {
      vC.set(palmPt[1], palmPt[2], palmPt[3]);
      if (!cs.holdingOil && vC.distanceTo(room.bottle.position) < 0.16) cs.holdingOil = true;
    }
    if (!press) cs.holdingOil = false;
    if (cs.holdingOil && palmPt) {
      oilHeld = true;
      room.bottle.position.set(palmPt[1], palmPt[2] + 0.02, palmPt[3] - 0.04);
      addContact(cs.side + 'oil', palmPt[1], palmPt[2], palmPt[3], 0.045, 0.85, true, false, dt);
    }
    const pressure = knead ? 1.9 : press ? 1.35 : 0.7;
    for (const p of pts) addContact(cs.side + p[0], p[1], p[2], p[3], p[4], pressure, cs.holdingOil, knead, dt);
    cs._palm = palmPt;
  }
  if (!oilHeld) room.bottle.position.lerp(room.bottleHome, 0.18);
}

const heldButtons = new Set();
function edgeFire(id, active) {
  if (!id) return;
  if (active && !heldButtons.has(id)) { heldButtons.add(id); fire(id); }
  if (!active) heldButtons.delete(id);
}
function pressPanel() {
  const active = new Set();
  for (const cs of controllers) {
    const indexJoint = cs.tracked ? cs.xrHand.joints?.['index-finger-tip'] : null;
    if (cs.tracked && indexJoint && indexJoint.visible) {
      indexJoint.getWorldPosition(vC);
      for (const child of panel.mesh.children) {
        child.getWorldPosition(vA);
        if (vC.distanceTo(vA) < 0.06) active.add(child.userData.button);
      }
    } else if (cs.select) {
      cs.ctrl.getWorldPosition(vC);
      cs.ctrl.getWorldDirection(vD);
      raycaster.set(vC, vD);
      const hits = raycaster.intersectObjects(panel.mesh.children, false);
      if (hits[0]?.object.userData.button) active.add(hits[0].object.userData.button);
    }
  }
  for (const b of panel.buttons) edgeFire(b.id, active.has(b.id));
}

let audioCtx = null;
function breathe() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const dur = 0.4;
  const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / data.length);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.035;
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  src.start();
}

function frame(t) {
  const dt = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;
  contacts.length = 0;
  desktopMove(dt);
  if (!renderer.xr.isPresenting && massaging) {
    const hits = cast();
    const body = hits.find(h => h.object.userData.flesh || h.object.userData.kind === 'cloth');
    if (body) {
      placeCursor(body, true);
      pushCursorContacts(dt, true);
    }
  } else if (!renderer.xr.isPresenting) {
    const hits = cast();
    const body = hits.find(h => h.object.userData.flesh || h.object.userData.kind === 'cloth');
    if (body && mouse.x > -1.5) placeCursor(body, false);
    else {
      camera.getWorldDirection(vA);
      camera.getWorldPosition(vB);
      cursor.position.copy(vB).addScaledVector(vA, 0.62);
      cursor.quaternion.copy(camera.quaternion);
    }
  }
  cursor.visible = !renderer.xr.isPresenting;
  updateMarkers();
  gatherHands(dt);
  updateMarkers();
  if (demoPress) {
    if (cc && cc.breast) cc.breast.getWorldPosition(vC);
    else woman.breasts[0].getWorldPosition(vC);
    addContact('demo', vC.x, vC.y + 0.05, vC.z, 0.055, 1.5, false, true, dt);
  }
  pressPanel();
  avoidSolids();

  let touch = 0, hard = 0;
  for (const d of deformers) {
    const r = d.update(dt, contacts, time);
    touch += r.touch;
    hard += r.hard;
  }
  const touching = touch > 0.03;
  if (!lockMood) {
    if (touching) {
      state.ease += dt * 0.18 * Math.min(2.2, touch * 0.35);
      if (hard > 0.15) state.tension += dt * 0.4 * Math.min(2, hard);
    }
    state.ease = THREE.MathUtils.clamp(state.ease * (1 - dt * 0.045), 0, 1);
    state.tension = THREE.MathUtils.clamp(state.tension - dt * 0.12, 0, 1);
  }
  if (cc && cc.head) {
    cc.head.getWorldPosition(vA);
    state.gaze.set(vA.x, vA.y + 0.28, vA.z);
  } else {
    woman.root.updateMatrixWorld(true);
    vA.set(0, 0.16, 0.66).applyMatrix4(woman.root.matrixWorld);
    state.gaze.set(vA.x, vA.y + 0.35, vA.z);
  }
  const felt = contacts.find(c => c.hit > 0);
  if (felt) state.gaze.lerp(vB.set(felt.x, felt.y + 0.08, felt.z), 0.45);
  if (cc) cc.update(dt, state, contacts);
  else face.update(dt, state, time);

  if (touching && state.ease > 0.4 && time - lastBreath > 4.2) {
    lastBreath = time;
    breathe();
  }
  for (const cs of controllers) {
    const mine = contacts.filter(c => c.id && c.id.startsWith(cs.side) && c.hit > 0);
    if (!mine.length) continue;
    cs.hapticT -= dt;
    if (cs.hapticT <= 0) {
      const soft = Math.max(...mine.map(c => c.softHit || 0));
      haptic(cs, 0.05 + (1 - soft) * 0.22);
      cs.hapticT = 0.14;
    }
  }
  if (Math.floor(time * 4) !== Math.floor((time - dt) * 4)) syncUI(false);
  renderer.render(scene, camera);
}

async function showCharacter(file) {
  const name = file || state.vrm;
  if (!name || vrmLoading) return;
  vrmLoading = true;
  const had = !!cc;
  if (!had) woman.root.visible = false;
  try {
    const next = await loadCharacter(name);
    applyPosePreset(next, state.pose);
    releaseCharacter();
    cc = next;
    state.vrm = next.file;
    state.vrmName = next.metaName;
    state.vrmAuthors = next.metaAuthors.join('、');
    state.clothOn = {};
    if (qs.get('undress') === '1') {
      for (const piece of next.clothes) state.clothOn[piece.id] = false;
    }
    scene.add(cc.root);
    scene.add(cc.look);
    for (const mesh of cc.bodies || []) deformers.push(makeSoft(mesh));
    woman.root.visible = false;
    placeBody();
    refreshClothes();
    updateMarkers();
  } catch (err) {
    if (!cc) woman.root.visible = true;
    errBox.textContent += (err && err.message ? err.message : String(err)) + '\n';
    placeBody();
    refreshClothes();
  }
  vrmLoading = false;
  renderVrmList();
  syncUI(true);
}

function releaseCharacter() {
  if (!cc) return;
  const owned = new Set();
  cc.root.traverse(obj => { if (obj.isMesh) owned.add(obj); });
  for (let i = deformers.length - 1; i >= 0; i--) {
    if (owned.has(deformers[i].mesh)) deformers.splice(i, 1);
  }
  scene.remove(cc.root);
  scene.remove(cc.look);
  cc.root.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) if (mat && mat.dispose) mat.dispose();
  });
  cc = null;
}

const vrmList = [];
let vrmLoading = false;

function renderVrmList() {
  const box = document.getElementById('vrmlist');
  if (!box) return;
  box.replaceChildren();
  if (!vrmList.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'VRM がまだありません';
    box.appendChild(empty);
    return;
  }
  for (const name of vrmList) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.vrm = name;
    button.textContent = name.replace(/\.vrm$/i, '');
    button.classList.toggle('on', name === state.vrm);
    box.appendChild(button);
  }
}

async function refreshVrmList(switchIfMissing) {
  const files = await listVrmFiles();
  vrmList.splice(0, vrmList.length, ...files);
  if (!state.vrm) {
    const requested = qs.get('vrm');
    if (requested && vrmList.includes(requested)) state.vrm = requested;
    else if (vrmList.includes('まっさ.vrm')) state.vrm = 'まっさ.vrm';
    else if (vrmList[0]) state.vrm = vrmList[0];
  } else if (switchIfMissing && !vrmList.includes(state.vrm) && vrmList[0]) {
    renderVrmList();
    await showCharacter(vrmList[0]);
    return;
  }
  renderVrmList();
  syncUI(true);
}

function cycleVrm(step) {
  if (!vrmList.length || vrmLoading) return;
  let index = vrmList.indexOf(state.vrm);
  if (index < 0) index = 0;
  const next = (index + step + vrmList.length) % vrmList.length;
  showCharacter(vrmList[next]);
}

if (shot) {
  await refreshVrmList(false);
  await showCharacter();
  window.__shot = { scene, camera, dolly, renderer, THREE, deformers, cc: () => cc, applyPose, applyPosePreset, layCharacter, updateMarkers, markerGroup, followJoint, limbPoint, BED_TOP, vrmList };
  renderer.render(scene, camera);
  document.title = 'VRMREADY';
} else {
  refreshVrmList(false).then(() => showCharacter());
  renderer.setAnimationLoop(frame);
}
setupControllers();

function placePlayerInRoom() {
  dolly.position.set(0.52, 0, 0.05);
  dolly.rotation.set(0, Math.PI / 2, 0);
}
renderer.xr.addEventListener('sessionstart', () => {
  placePlayerInRoom();
  if (vrbtn) vrbtn.textContent = 'VRを終了';
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 1.42, 0);
  camera.rotation.set(-0.78, 0, 0);
  dolly.position.set(0.78, 0.2, 0.95);
  dolly.rotation.set(0, 0.78, 0);
  if (vrbtn) vrbtn.textContent = 'VRを開始';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', e => {
  setMouse(e);
  if (e.button === 2) { looking = true; lookX = e.clientX; lookY = e.clientY; return; }
  if (e.button !== 0) return;
  if (state.joints) {
    updateMarkers();
    raycaster.setFromCamera(mouse, camera);
    const mark = raycaster.intersectObjects(markerHits, false)[0];
    poseJoint = mark?.object.userData.joint || null;
    if (poseJoint && poseJoint === kneeHeld) kneeHeld = null;
    posing = !!poseJoint;
    poseSX = e.clientX;
    poseSY = e.clientY;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }
  const hits = cast();
  const ui = hits.find(h => h.object.userData.button);
  if (ui) { fire(ui.object.userData.button); return; }
  if (hits.some(h => h.object.userData.flesh || h.object.userData.kind === 'cloth')) massaging = true;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
});
renderer.domElement.addEventListener('pointermove', e => {
  setMouse(e);
  if (posing && poseJoint) {
    raycaster.setFromCamera(mouse, camera);
    limbPoint(poseJoint, poseSolveCur);
    const along = Math.max(0.15, poseSolveCur.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction));
    posePoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, along);
    followJoint(poseJoint, posePoint);
    return;
  }
  if (!looking) return;
  const dx = e.clientX - lookX, dy = e.clientY - lookY;
  lookX = e.clientX; lookY = e.clientY;
  dolly.rotation.y -= dx * 0.005;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.15, 0.35);
});
addEventListener('pointerup', () => { massaging = false; looking = false; posing = false; poseJoint = null; kneeHeld = null; });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Digit1') fire('pose:supine');
  if (e.code === 'Digit2') fire('pose:prone');
  if (e.code === 'Digit3') fire('pose:missionary');
  if (e.code === 'Digit4') fire('pose:doggy');
  if (e.code === 'Digit5') fire('pose:cowgirl');
  if (e.code === 'KeyF') fire('oil');
  if (e.code === 'KeyR') resetAll();
});
addEventListener('keyup', e => { keys[e.code] = false; });

const vrbtn = document.getElementById('vrbtn');
if (!navigator.xr) {
  vrbtn.textContent = 'VR非対応（この画面で操作できます）';
} else {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    vrbtn.disabled = !ok;
    vrbtn.textContent = ok ? 'VRを開始' : 'VR非対応（この画面で操作できます）';
    if (!ok) return;
    vrbtn.addEventListener('click', async () => {
      if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
      const features = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
      try {
        let session = await navigator.xr.requestSession('immersive-vr', features);
        try {
          await renderer.xr.setSession(session);
        } catch (err) {
          session.end();
          renderer.xr.setReferenceSpaceType('local');
          session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
          await renderer.xr.setSession(session);
        }
      } catch (err) {
        errBox.textContent += (err && err.message ? err.message : String(err)) + '\n';
        vrbtn.textContent = 'VRを開始';
      }
    });
  }).catch(() => { vrbtn.textContent = 'この画面で操作できます'; });
}
