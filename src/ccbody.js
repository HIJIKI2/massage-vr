// VRM 0.0 と 1.0。クレジットはメタデータに従う。
import * as THREE from 'three';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { VRMLoaderPlugin } from '../lib/three-vrm.module.js';

const VRM_DIR = './assets/VRM/';

function showTexture(mat) {
  const name = mat.name || '';
  const hair = /HAIR/i.test(name);
  const skin = /_SKIN/i.test(name);
  const eye = /EYE/i.test(name);
  const blend = /EyeHighlight|Eyelash|EYELINE|FaceBrow/i.test(name);
  const map = mat.map || null;
  const color = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
  if (skin) color.multiply(new THREE.Color(0.82, 0.66, 0.58));
  const basic = new THREE.MeshStandardMaterial({
    map,
    color,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: map,
    emissiveIntensity: hair ? 0.05 : eye ? 0.1 : 0.012,
    roughness: skin ? 0.86 : 0.72,
    metalness: 0,
    envMapIntensity: skin ? 0.18 : 0.55,
    transparent: blend,
    alphaTest: hair ? Math.max(0.5, mat.alphaTest || 0) : (blend ? 0.02 : (mat.alphaTest || 0)),
    opacity: 1,
    side: mat.side ?? THREE.FrontSide,
    depthWrite: !blend,
  });
  basic.name = name;
  basic.skinning = true;
  basic.morphTargets = true;
  if (hair) {
    basic.polygonOffset = true;
    basic.polygonOffsetFactor = -1;
    basic.polygonOffsetUnits = -1;
  }
  return basic;
}

function paintSoft(mesh) {
  const pos = mesh.geometry.attributes.position;
  if (!pos || mesh.geometry.getAttribute('aSoft')) return;
  const soft = new Float32Array(pos.count);
  soft.fill(0.72);
  mesh.geometry.setAttribute('aSoft', new THREE.BufferAttribute(soft, 1));
  mesh.userData.flesh = true;
  mesh.userData.kind = 'vrmbody';
  mesh.userData.dispScale = 1.6;
  mesh.userData.keepNormals = true;
}

function bustSideName(name) {
  if (/_L_|L_Bust|Bust_L|BustL/i.test(name)) return 'L';
  if (/_R_|R_Bust|Bust_R|BustR/i.test(name)) return 'R';
  return '';
}

function paintFleshRegions(mesh, vrm0) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const skinIndex = geo.attributes.skinIndex;
  const skinWeight = geo.attributes.skinWeight;
  const bones = mesh.skeleton?.bones;
  if (!pos || !skinIndex || !skinWeight || !bones?.length) {
    paintSoft(mesh);
    return;
  }
  const count = pos.count;
  const influences = skinIndex.itemSize || 4;
  const soft = new Float32Array(count);
  soft.fill(0.72);
  const region = new Float32Array(count);
  const hipW = new Float32Array(count);
  const weightNamed = (i, test) => {
    let w = 0;
    for (let k = 0; k < influences; k++) {
      const bone = bones[Math.round(skinIndex.getComponent(i, k))];
      if (bone && test(bone.name || '')) w += skinWeight.getComponent(i, k);
    }
    return w;
  };
  let zSum = 0;
  let ySum = 0;
  let nHip = 0;
  for (let i = 0; i < count; i++) {
    const w = weightNamed(i, name => /Hips/i.test(name));
    hipW[i] = w;
    if (w > 0.45) {
      zSum += pos.getZ(i);
      ySum += pos.getY(i);
      nHip++;
    }
  }
  const zMid = nHip ? zSum / nHip : 0;
  const yMid = nHip ? ySum / nHip : 0;
  const back = vrm0 ? 1 : -1;
  const acc = {
    1: new THREE.Vector3(),
    2: new THREE.Vector3(),
    3: new THREE.Vector3(),
    4: new THREE.Vector3(),
    5: new THREE.Vector3(),
  };
  const tally = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const bonePick = { 1: '', 2: '', 3: '', 4: '', 5: '' };
  const boneScore = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let leftX = 0;
  let leftN = 0;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < influences; k++) {
      const bone = bones[Math.round(skinIndex.getComponent(i, k))];
      const name = bone?.name || '';
      if (!/UpperLeg/i.test(name) || bustSideName(name) !== 'L') continue;
      if (skinWeight.getComponent(i, k) > 0.55) {
        leftX += pos.getX(i);
        leftN++;
        break;
      }
    }
  }
  const leftPositive = !leftN || leftX >= 0;
  const gluteSide = x => (x >= 0) === leftPositive ? 3 : 4;
  const consider = (tag, name, w) => {
    if (!name || w <= boneScore[tag]) return;
    boneScore[tag] = w;
    bonePick[tag] = name;
  };
  for (let i = 0; i < count; i++) {
    let bustL = 0;
    let bustR = 0;
    let legL = 0;
    let legR = 0;
    let legAny = 0;
    let spine = 0;
    let spineName = '';
    let spineW = 0;
    for (let k = 0; k < influences; k++) {
      const bone = bones[Math.round(skinIndex.getComponent(i, k))];
      const name = bone?.name || '';
      const w = skinWeight.getComponent(i, k);
      if (/Bust/i.test(name)) {
        const side = bustSideName(name);
        if (side === 'L') {
          bustL += w;
          consider(1, name, w);
        } else if (side === 'R') {
          bustR += w;
          consider(2, name, w);
        }
      } else if (/UpperLeg/i.test(name)) {
        const side = bustSideName(name);
        if (side === 'L') legL += w;
        else if (side === 'R') legR += w;
        legAny += w;
      } else if (/Leg|Foot/i.test(name)) legAny += w;
      else if (/Spine|Chest|UpperChest/i.test(name) && !/Bust|Neck|Head|Arm|Shoulder/i.test(name)) {
        spine += w;
        if (w > spineW) { spineW = w; spineName = name; }
      }
    }
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const behind = (z - zMid) * back > 0.008;
    const front = (z - zMid) * back < -0.006;
    let tag = 0;
    if (bustL > 0.22 || bustR > 0.22) tag = bustL >= bustR ? 1 : 2;
    else if (hipW[i] > 0.32 && legAny < 0.38 && behind && Math.abs(y - yMid) < 0.16 && Math.abs(x) < 0.2) {
      tag = gluteSide(x);
      consider(tag, bones.find(b => /Hips/i.test(b.name || ''))?.name || '', hipW[i]);
    } else if ((legL > 0.2 || legR > 0.2) && hipW[i] > 0.05 && behind && y > yMid - 0.05 && y < yMid + 0.14) {
      tag = legL >= legR ? 3 : 4;
      consider(tag, bones.find(b => /Hips/i.test(b.name || ''))?.name || '', 0.5);
    } else if (spine > 0.32 && legAny < 0.22 && front && y > yMid - 0.02 && y < yMid + 0.24 && Math.abs(x) < 0.16) {
      tag = 5;
      consider(5, spineName, spine);
    }
    if (!tag) continue;
    region[i] = tag;
    soft[i] = tag === 5 ? 0.92 : 0.99;
    acc[tag].x += x;
    acc[tag].y += y;
    acc[tag].z += z;
    tally[tag]++;
  }
  const centers = [];
  const reachOf = { 1: 0.11, 2: 0.11, 3: 0.18, 4: 0.18, 5: 0.13 };
  for (const tag of [1, 2, 3, 4, 5]) {
    if (tally[tag] < 24) {
      for (let i = 0; i < count; i++) if (region[i] === tag) {
        region[i] = 0;
        soft[i] = 0.72;
      }
      continue;
    }
    centers.push({
      region: tag,
      local: acc[tag].multiplyScalar(1 / tally[tag]),
      reach: reachOf[tag],
      bone: bonePick[tag] || '',
      inward: tag === 3 || tag === 4 ? new THREE.Vector3(0, 0, -back) : null,
    });
  }
  geo.setAttribute('aSoft', new THREE.BufferAttribute(soft, 1));
  geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
  mesh.userData.flesh = true;
  mesh.userData.kind = 'vrmbody';
  mesh.userData.dispScale = 1.6;
  mesh.userData.keepNormals = true;
  mesh.userData.regionCenters = centers;
}

const _axisX = new THREE.Vector3(1, 0, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _axisY = new THREE.Vector3(0, 1, 0);
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _pC = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _poleProj = new THREE.Vector3();
const _upperDir = new THREE.Vector3();
const _lowerDir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _finger = new THREE.Vector3();
const _thumbDir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _localUp = new THREE.Vector3();
const _mapped = new THREE.Vector3();
const _want = new THREE.Vector3();
const _limb = new THREE.Vector3();
const _qAlign = new THREE.Quaternion();
const _qTwist = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _basis = new THREE.Matrix4();

export function defaultPose() {
  return {
    leftUpperArm: 0, rightUpperArm: 0,
    leftArmLift: 0, rightArmLift: 0,
    leftElbow: 0, rightElbow: 0,
    leftHip: 0, rightHip: 0,
    leftKnee: 0, rightKnee: 0,
    leftSpread: 0, rightSpread: 0,
    spine: 0, chest: 0, head: 0,
  };
}

export const POSE_PRESETS = {
  supine: { orient: 'supine' },
  prone: { orient: 'prone' },
  missionary: {
    orient: 'supine',
    leftHip: 0.85, rightHip: 0.85,
    leftKnee: 1.65, rightKnee: 1.65,
    leftSpread: 0.72, rightSpread: 0.72,
    leftUpperArm: 0.7, rightUpperArm: 0.7,
    leftElbow: 0.45, rightElbow: 0.45,
  },
  doggy: {
    orient: 'doggy',
    leftHip: -1.15, rightHip: -1.15,
    leftKnee: 1.1, rightKnee: 1.1,
    leftSpread: 0.28, rightSpread: 0.28,
    leftUpperArm: 0.25, rightUpperArm: 0.25,
    leftArmLift: 0.35, rightArmLift: 0.35,
    leftElbow: 0.7, rightElbow: 0.7,
  },
  cowgirl: {
    orient: 'kneel',
    rootPitch: 0.22,
    leftHip: 0.08, rightHip: 0.08,
    leftKnee: 1.4, rightKnee: 1.4,
    leftSpread: 0.55, rightSpread: 0.55,
    leftElbow: 0.45, rightElbow: 0.45,
    leftUpperArm: 0.12, rightUpperArm: 0.12,
    head: 0.42,
    spine: 0.06,
  },
};

function poseBone(bone, turns) {
  if (!bone) return;
  if (!bone.userData.restQuat) bone.userData.restQuat = bone.quaternion.clone();
  bone.quaternion.copy(bone.userData.restQuat);
  for (const [axis, angle] of turns) {
    bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  }
  bone.quaternion.normalize();
  bone.updateMatrix();
}

function applyPoseBones(vrm, pose, orient) {
  const human = vrm.humanoid;
  if (!human) return;
  const p = pose || defaultPose();
  const vrm0 = vrm.meta?.metaVersion === '0';
  const node = name => (vrm0 ? human.getNormalizedBoneNode(name) : human.getRawBoneNode(name));
  const faceDown = orient === 'prone' || orient === 'doggy';
  const bend = faceDown ? 1 : -1;
  const assist = orient === 'supine' ? 0.5 : 0;
  const flex = (hip, knee) => THREE.MathUtils.clamp(bend * (hip + knee * assist), -2.6, 2.6);
  // VRM 0.0 の正規化骨は、正面が -Z の時点のワールド軸。VRM 1.0 と同じ角度だと上下が反転する。
  const s = vrm0 ? -1 : 1;
  human.autoUpdateHumanBones = false;
  poseBone(node('spine'), [[_axisX, s * (p.spine || 0)]]);
  poseBone(node('chest'), [[_axisX, s * (p.chest || 0)]]);
  poseBone(node('neck'), [[_axisX, s * (p.head || 0) * 0.35]]);
  poseBone(node('head'), [[_axisX, s * (p.head || 0)]]);
  poseBone(node('leftShoulder'), [[_axisZ, s * -0.25]]);
  poseBone(node('rightShoulder'), [[_axisZ, s * 0.25]]);
  poseBone(node('leftUpperArm'), [[_axisZ, s * (-0.9 + p.leftUpperArm)], [_axisY, s * (0.05 - p.leftArmLift)]]);
  poseBone(node('rightUpperArm'), [[_axisZ, s * (0.9 - p.rightUpperArm)], [_axisY, s * (-0.05 + p.rightArmLift)]]);
  poseBone(node('leftLowerArm'), [[_axisZ, s * -0.2], [_axisY, s * -p.leftElbow]]);
  poseBone(node('rightLowerArm'), [[_axisZ, s * 0.2], [_axisY, s * p.rightElbow]]);
  poseBone(node('leftUpperLeg'), [[_axisX, (vrm0 ? -1 : 1) * flex(p.leftHip, p.leftKnee)], [_axisZ, p.leftSpread]]);
  poseBone(node('rightUpperLeg'), [[_axisX, (vrm0 ? -1 : 1) * flex(p.rightHip, p.rightKnee)], [_axisZ, -p.rightSpread]]);
  poseBone(node('leftLowerLeg'), [[_axisX, (vrm0 ? -1 : 1) * p.leftKnee]]);
  poseBone(node('rightLowerLeg'), [[_axisX, (vrm0 ? -1 : 1) * p.rightKnee]]);
  if (vrm0) {
    human.autoUpdateHumanBones = true;
    human.update();
    human.autoUpdateHumanBones = false;
  }
  vrm.scene.updateMatrixWorld(true);
}

export function applyPose(model) {
  applyPoseBones(model.vrm, model.pose, model.orient || (model.prone ? 'prone' : 'supine'));
  if (model.orient === 'doggy' && !model.keepArms && model.bedTop != null) plantDoggyHands(model, model.bedTop);
}

export function applyPosePreset(model, name) {
  const preset = POSE_PRESETS[name] || POSE_PRESETS.supine;
  const pose = defaultPose();
  for (const key of Object.keys(pose)) {
    if (preset[key] != null) pose[key] = preset[key];
  }
  if (!model.pose) model.pose = pose;
  else Object.assign(model.pose, pose);
  model.orient = preset.orient;
  model.rootPitch = preset.rootPitch || 0;
  model.keepArms = false;
  model.prone = preset.orient === 'prone' || preset.orient === 'doggy';
}

function prepare(vrm) {
  const root = vrm.scene;
  root.name = 'vrm';
  const bodies = [];
  const faces = [];
  root.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      const n = obj.name || '';
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map(mat => showTexture(mat));
      obj.material = next.length === 1 ? next[0] : next;
      if (/hair/i.test(n)) {
        obj.renderOrder = 2;
        return;
      }
      obj.userData.flesh = true;
      if (/face/i.test(n)) faces.push(obj);
      else {
        bodies.push(obj);
        paintFleshRegions(obj, vrm.meta?.metaVersion === '0');
      }
    }
  });
  const manager = vrm.springBoneManager;
  const bustBySide = { L: [], R: [] };
  const bustRoots = [];
  if (manager) {
    for (const joint of manager._joints || []) {
      const name = joint.bone?.name || '';
      if (!/Bust/i.test(name)) continue;
      const side = bustSideName(name);
      if (!side) continue;
      bustBySide[side].push(joint);
      if (/Bust1$/i.test(name)) bustRoots.push({ joint, side });
    }
  }
  if (!bustRoots.length) {
    for (const side of ['L', 'R']) {
      if (bustBySide[side][0]) bustRoots.push({ joint: bustBySide[side][0], side });
    }
  }
  const bustPos = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const bustPull = new THREE.Vector3();
  const bustSlide = new THREE.Vector3();
  const bustTouch = {
    L: { prev: new THREE.Vector3(), have: false },
    R: { prev: new THREE.Vector3(), have: false },
  };
  const look = new THREE.Object3D();
  look.name = 'vrm-look';
  if (vrm.lookAt) vrm.lookAt.target = look;
  const head = vrm.humanoid?.getRawBoneNode('head') || null;
  const pose = defaultPose();
  let blinkT = 2.2;
  function update(dt, mood, contacts = []) {
    const relax = THREE.MathUtils.clamp(mood.ease - mood.tension * 0.55, 0, 1);
    blinkT -= dt;
    if (blinkT < 0) blinkT = 2.4 + Math.random() * 3.2;
    const blink = blinkT > 2.2 ? Math.sin((2.35 - blinkT) / 0.15 * Math.PI) : 0;
    const shut = Math.min(1, relax * 0.35 + Math.max(0, blink));
    const mgr = vrm.expressionManager;
    if (mgr) {
      mgr.setValue('relaxed', relax);
      mgr.setValue('happy', relax * 0.25);
      mgr.setValue('blink', shut);
    }
    if (look.parent) look.position.copy(mood.gaze);
    const saved = [];
    for (const root of bustRoots) {
      root.joint.bone.updateWorldMatrix(true, false);
      root.joint.bone.getWorldPosition(bustPos[root.side]);
    }
    const chosen = { L: null, R: null };
    for (const c of contacts) {
      let best = null;
      let bestD = 0.12;
      let second = 999;
      for (const root of bustRoots) {
        const p = bustPos[root.side];
        const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
        if (d < bestD) {
          second = best ? best.d : second;
          best = { root, d };
          bestD = d;
        } else if (d < second) second = d;
      }
      if (!best || best.d + 0.018 >= second) continue;
      const side = best.root.side;
      if (!chosen[side] || best.d < chosen[side].d) chosen[side] = { c, d: best.d, root: best.root };
    }
    for (const side of ['L', 'R']) {
      const pick = chosen[side];
      const mem = bustTouch[side];
      if (!pick) {
        mem.have = false;
        continue;
      }
      const origin = bustPos[side];
      bustPull.set(pick.c.x - origin.x, pick.c.y - origin.y, pick.c.z - origin.z);
      if (mem.have) {
        bustSlide.set(pick.c.x - mem.prev.x, pick.c.y - mem.prev.y, pick.c.z - mem.prev.z);
        bustPull.addScaledVector(bustSlide, 8);
      }
      mem.prev.set(pick.c.x, pick.c.y, pick.c.z);
      mem.have = true;
      if (bustPull.lengthSq() < 1e-8) continue;
      bustPull.normalize();
      const press = (pick.c.pressure || 1) * (pick.c.squeeze ? 1.45 : 1);
      const gain = (1 - pick.d / 0.12) * press;
      for (const joint of bustBySide[side]) {
        saved.push({
          joint,
          dir: joint.settings.gravityDir,
          power: joint.settings.gravityPower,
          stiffness: joint.settings.stiffness,
          drag: joint.settings.dragForce,
        });
        joint.settings.stiffness = 0.1;
        joint.settings.dragForce = 0.62;
        if (joint === pick.root.joint) {
          joint.settings.gravityDir = bustPull.clone();
          joint.settings.gravityPower = 3.4 * gain;
        }
      }
    }
    vrm.update(dt);
    for (const s of saved) {
      s.joint.settings.gravityDir = s.dir;
      s.joint.settings.gravityPower = s.power;
      s.joint.settings.stiffness = s.stiffness;
      s.joint.settings.dragForce = s.drag;
    }
    return relax;
  }
  const clothes = collectClothes(root, vrm);
  return { root, vrm, look, body: bodies[0] || null, face: faces[0] || null, bodies, faces, head, clothes, pose, update };
}

const CLOTH_PARTS = [
  [/^(socks|sock|stockings|tights|pantyhose)$/i, '靴下・タイツ'],
  [/^(shoes|shoe|boots|boot)$/i, '靴'],
  [/^(onepiece|dress)$/i, 'ワンピース'],
  [/^(bra|bustier|innertop|inner)$/i, '下着（上）'],
  [/^(panties|briefs|innerbottom)$/i, '下着（下）'],
  [/^underwear$/i, '下着'],
  [/^(tops|top|shirt|blouse|jacket|coat|outer)$/i, 'トップス'],
  [/^(bottoms|bottom|skirt|pants|trousers|shorts)$/i, 'ボトムス'],
  [/^(gloves|glove)$/i, '手袋'],
  [/^(hat|cap|hood)$/i, '帽子'],
  [/^(accessory|accessories|ribbon|belt|bag)$/i, 'アクセサリー'],
];
const CLOTH_RANK = ['トップス', 'ワンピース', 'ボトムス', '下着（上）', '下着', '下着（下）', '靴下・タイツ', '靴', '手袋', '帽子', 'アクセサリー', '衣装'];

function labelForPart(part) {
  const hit = CLOTH_PARTS.find(([re]) => re.test(part));
  return hit ? hit[1] : '';
}

function describeClothMaterial(name) {
  const raw = String(name || '').replace(/\s*\(Instance\)\s*$/i, '').trim();
  const typed = raw.match(/^[A-Za-z]+\d*_(\d+)_\d+_([A-Za-z][A-Za-z0-9]*)_\d+_CLOTH$/i);
  if (typed) {
    const label = labelForPart(typed[2]) || '衣装';
    return { part: typed[2], item: typed[1], label };
  }
  if (!/_CLOTH$/i.test(raw)) return null;
  const loose = CLOTH_PARTS.find(([re]) => re.test(raw));
  return { part: loose ? loose[1] : 'cloth', item: raw, label: loose ? loose[1] : '衣装' };
}

function describeClothMesh(name) {
  const raw = String(name || '');
  if (/^(body|face|hair|eye)/i.test(raw)) return null;
  const label = labelForPart(raw) || (
    /cloth|wear|outfit|costume|衣装|服|clothing/i.test(raw) ? '衣装' : ''
  );
  if (!label) return null;
  return { part: raw, item: raw, label };
}

function collectClothes(root, vrm) {
  const groups = new Map();
  const claimed = new Set();
  const remember = mat => {
    if (!mat.userData.clothBase) {
      mat.userData.clothBase = {
        opacity: mat.opacity,
        transparent: mat.transparent,
        depthWrite: mat.depthWrite,
      };
    }
  };
  const add = (info, mat, mesh) => {
    const key = info.label + ':' + info.part + ':' + info.item;
    let group = groups.get(key);
    if (!group) {
      group = { label: info.label, materials: [], meshes: new Set() };
      groups.set(key, group);
    }
    if (mat && !group.materials.includes(mat)) group.materials.push(mat);
    group.meshes.add(mesh);
    if (mat) {
      claimed.add(mat);
      remember(mat);
    }
  };
  const attachOutlines = (baseName, group) => {
    if (!baseName) return;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || group.materials.includes(mat)) continue;
        const n = mat.name || '';
        const base = baseName.replace(/\s*\(Instance\)\s*$/i, '').trim();
        const outline = n === base + ' (Outline)' || n === baseName + ' (Outline)' || (n.startsWith(base) && /Outline/i.test(n));
        if (outline) {
          group.materials.push(mat);
          group.meshes.add(obj);
          claimed.add(mat);
          remember(mat);
        }
      }
    });
  };
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      const info = describeClothMaterial(mat.name);
      if (info) add(info, mat, obj);
    }
  });
  for (const group of groups.values()) {
    for (const mat of [...group.materials]) attachOutlines(mat.name, group);
  }
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = (Array.isArray(obj.material) ? obj.material : [obj.material]).filter(Boolean);
    if (!mats.length || mats.some(m => claimed.has(m))) return;
    if (mats.some(m => /_(SKIN|HAIR|FACE|EYE)\b/i.test(m.name || ''))) return;
    const info = describeClothMesh(obj.name);
    if (!info) return;
    for (const mat of mats) add(info, mat, obj);
  });
  const custom = vrm.expressionManager?.customExpressionMap;
  if (custom) {
    for (const name of Object.keys(custom)) {
      const info = describeClothMesh(name);
      if (!info) continue;
      const key = 'expr:' + name;
      if (groups.has(key)) continue;
      groups.set(key, { label: info.label === '衣装' ? name : info.label, materials: [], meshes: new Set(), expr: name });
    }
  }
  const pieces = [...groups.values()];
  pieces.sort((a, b) => {
    const ra = CLOTH_RANK.indexOf(a.label);
    const rb = CLOTH_RANK.indexOf(b.label);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.label.localeCompare(b.label, 'ja');
  });
  const dup = {};
  for (const piece of pieces) dup[piece.label] = (dup[piece.label] || 0) + 1;
  const seen = {};
  for (const piece of pieces) {
    if (dup[piece.label] > 1) {
      seen[piece.label] = (seen[piece.label] || 0) + 1;
      piece.label = piece.label + ' ' + seen[piece.label];
    }
  }
  pieces.forEach((piece, index) => {
    piece.id = 'c' + index;
    const meshes = [...piece.meshes];
    piece.hideMesh = false;
    piece.mesh = null;
    if (meshes.length === 1) {
      const mesh = meshes[0];
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
      const sole = pieces.filter(other => other.meshes.has(mesh)).length === 1;
      if (sole && mats.length && mats.every(m => piece.materials.includes(m))) {
        piece.hideMesh = true;
        piece.mesh = mesh;
      }
    }
  });
  return pieces;
}

function ensureOutlines(model) {
  const root = model.root;
  if (!root) return;
  for (const piece of model.clothes || []) {
    const bases = piece.materials
      .map(mat => String(mat.name || '').replace(/\s*\(Instance\)\s*$/i, '').trim())
      .filter(name => name && !/Outline/i.test(name));
    root.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || piece.materials.includes(mat)) continue;
        const n = mat.name || '';
        if (!bases.some(base => n === base + ' (Outline)' || (n.startsWith(base) && /Outline/i.test(n)))) continue;
        piece.materials.push(mat);
        piece.meshes.add(obj);
        if (!mat.userData.clothBase) {
          mat.userData.clothBase = { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
        }
      }
    });
  }
}

export function applyClothes(model, onMap) {
  if (!model) return;
  ensureOutlines(model);
  const mgr = model.vrm?.expressionManager;
  for (const piece of model.clothes || []) {
    const on = !onMap || onMap[piece.id] !== false;
    if (piece.expr && mgr) mgr.setValue(piece.expr, on ? 1 : 0);
    for (const mat of piece.materials) {
      const base = mat.userData.clothBase || { opacity: 1, transparent: false, depthWrite: true };
      mat.visible = on;
      mat.opacity = on ? base.opacity : 0;
      mat.transparent = on ? base.transparent : true;
      mat.depthWrite = on ? base.depthWrite : false;
      mat.needsUpdate = true;
    }
    if (piece.hideMesh && piece.mesh) piece.mesh.visible = on;
  }
}

const _skin = new THREE.Vector3();

function bodyLowY(root) {
  const ys = [];
  root.updateMatrixWorld(true);
  root.traverse(obj => {
    if (!obj.isSkinnedMesh) return;
    if (/hair/i.test(obj.name || '')) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const geo = obj.geometry;
    const index = geo.index;
    const groups = geo.groups && geo.groups.length
      ? geo.groups
      : [{ start: 0, count: index ? index.count : geo.attributes.position.count, materialIndex: 0 }];
    obj.skeleton.update();
    for (const g of groups) {
      const mat = mats[g.materialIndex] || mats[0];
      if (mat && /HAIR/i.test(mat.name || '')) continue;
      const end = g.start + g.count;
      const step = index ? 4 : 3;
      for (let i = g.start; i < end; i += step) {
        obj.getVertexPosition(index ? index.getX(i) : i, _skin);
        _skin.applyMatrix4(obj.matrixWorld);
        if (Math.abs(_skin.x) > 0.16) continue;
        ys.push(_skin.y);
      }
    }
  });
  if (!ys.length) return null;
  ys.sort((a, b) => a - b);
  const at = p => ys[Math.min(ys.length - 1, Math.floor((ys.length - 1) * p))];
  return { n: ys.length, min: ys[0], y: at(0.08) };
}

function setOrient(root, orient, pitch, vrm0) {
  root.rotation.set(0, 0, 0);
  root.quaternion.identity();
  if (orient === 'kneel') {
    root.rotation.set(pitch || 0.32, 0, 0);
  } else {
    const basis = new THREE.Matrix4();
    if (orient === 'prone' || orient === 'doggy') {
      basis.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
    } else {
      basis.makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    }
    root.quaternion.setFromRotationMatrix(basis);
  }
  // VRM 0.0 は顔が -Z を向く。180度回して 1.0 と同じ前を向ける。
  if (vrm0) {
    _qDelta.setFromAxisAngle(_axisY, Math.PI);
    root.quaternion.multiply(_qDelta);
  }
}

function boneLowY(model, names) {
  const human = model.vrm.humanoid;
  let y = Infinity;
  const p = new THREE.Vector3();
  for (const name of names) {
    const node = human?.getRawBoneNode(name);
    if (!node) continue;
    node.getWorldPosition(p);
    if (p.y < y) y = p.y;
  }
  return Number.isFinite(y) ? y : null;
}

function limbAxis(bone, out) {
  out.set(1, 0, 0);
  let best = 0;
  for (const child of bone.children) {
    if (!child.position) continue;
    const len = child.position.lengthSq();
    if (len > best) {
      best = len;
      out.copy(child.position);
    }
  }
  if (best > 1e-8) out.normalize();
  return out;
}

function aimBone(bone, localDir, dirWorld, upWorld) {
  _from.copy(localDir).normalize();
  _to.copy(dirWorld).normalize();
  const align = _from.dot(_to);
  if (align > 0.9999) _qAlign.identity();
  else if (align < -0.9999) _qAlign.setFromAxisAngle(_axisY, Math.PI);
  else _qAlign.setFromUnitVectors(_from, _to);
  _localUp.set(0, 1, 0);
  if (Math.abs(_from.dot(_localUp)) > 0.9) _localUp.set(0, 0, 1);
  _localUp.addScaledVector(_from, -_localUp.dot(_from)).normalize();
  _mapped.copy(_localUp).applyQuaternion(_qAlign);
  _want.copy(upWorld);
  _want.addScaledVector(_to, -_want.dot(_to));
  if (_want.lengthSq() < 1e-8) _want.copy(_mapped);
  else _want.normalize();
  const sin = _to.dot(_zAxis.crossVectors(_mapped, _want));
  _qTwist.setFromAxisAngle(_to, Math.atan2(sin, _mapped.dot(_want)));
  _qWorld.copy(_qTwist).multiply(_qAlign);
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qParent);
  bone.quaternion.copy(_qParent.invert()).multiply(_qWorld);
  bone.updateMatrixWorld(true);
}

function poseFinger(bone, spread, curl) {
  if (!bone) return;
  if (!bone.userData.restQuat) bone.userData.restQuat = bone.quaternion.clone();
  bone.quaternion.copy(bone.userData.restQuat);
  if (spread) {
    _qDelta.setFromAxisAngle(_axisY, spread);
    bone.quaternion.multiply(_qDelta);
  }
  if (curl) {
    _qDelta.setFromAxisAngle(_axisZ, curl);
    bone.quaternion.multiply(_qDelta);
  }
}

function plantDoggyHands(model, bedTop) {
  const human = model.vrm?.humanoid;
  if (!human) return;
  const fingers = [
    ['IndexProximal', -0.16, -0.22],
    ['MiddleProximal', 0, -0.22],
    ['RingProximal', 0.14, -0.22],
    ['LittleProximal', 0.28, -0.22],
    ['IndexIntermediate', 0, -0.12],
    ['MiddleIntermediate', 0, -0.12],
    ['RingIntermediate', 0, -0.12],
    ['LittleIntermediate', 0, -0.12],
  ];
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const upper = human.getRawBoneNode(side + 'UpperArm');
    const lower = human.getRawBoneNode(side + 'LowerArm');
    const hand = human.getRawBoneNode(side + 'Hand');
    if (!upper || !lower || !hand) continue;
    upper.getWorldPosition(_pA);
    lower.getWorldPosition(_pB);
    hand.getWorldPosition(_pC);
    const lab = _pA.distanceTo(_pB);
    const lbc = _pB.distanceTo(_pC);
    const y = bedTop + 0.02;
    const drop = _pA.y - y;
    const straight = (lab + lbc) * 0.9;
    const reach = Math.sqrt(Math.max(0.04, straight * straight - drop * drop));
    _pC.set(_pA.x + sign * 0.04, y, _pA.z + reach * 0.55);
    let dist = _pA.distanceTo(_pC);
    const maxD = lab + lbc - 0.015;
    const minD = Math.abs(lab - lbc) + 0.02;
    if (dist > maxD) { _pC.sub(_pA).setLength(maxD).add(_pA); dist = maxD; }
    if (dist < minD) { _pC.sub(_pA).setLength(minD).add(_pA); dist = minD; }
    _dir.copy(_pC).sub(_pA).normalize();
    const cosS = THREE.MathUtils.clamp((lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist), -1, 1);
    const shoulderAngle = Math.acos(cosS);
    _pole.set(sign * 0.45, 0.25, -1).normalize();
    _poleProj.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir));
    if (_poleProj.lengthSq() < 1e-8) _poleProj.set(sign, 0, 0);
    _poleProj.normalize();
    _upperDir.copy(_dir).multiplyScalar(Math.cos(shoulderAngle)).addScaledVector(_poleProj, Math.sin(shoulderAngle)).normalize();
    _pB.copy(_pA).addScaledVector(_upperDir, lab);
    _lowerDir.copy(_pC).sub(_pB).normalize();
    _bend.crossVectors(_upperDir, _lowerDir);
    if (_bend.lengthSq() < 1e-8) _bend.set(sign, 0, 0);
    _bend.normalize();
    aimBone(upper, limbAxis(upper, _limb), _upperDir, _bend);
    aimBone(lower, limbAxis(lower, _limb), _lowerDir, _bend);
    _finger.set(sign * 0.18, 0, 1).normalize();
    _yAxis.set(0, 1, 0);
    aimBone(hand, limbAxis(hand, _limb), _finger, _yAxis);
    for (const [name, spread, curl] of fingers) {
      poseFinger(human.getRawBoneNode(side + name), sign * spread, curl);
    }
    const thumb = human.getRawBoneNode(side + 'ThumbMetacarpal');
    if (thumb) {
      _thumbDir.set(sign * 0.92, 0.02, 0.35).normalize();
      _yAxis.set(0, 1, 0);
      aimBone(thumb, limbAxis(thumb, _limb), _thumbDir, _yAxis);
    }
  }
  model.root.updateMatrixWorld(true);
}

export function layCharacter(model, bedTop) {
  const root = model.root;
  const orient = model.orient || 'supine';
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  applyPoseBones(model.vrm, model.pose, orient);
  setOrient(root, orient, model.rootPitch, model.vrm0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.set(
    -(box.min.x + box.max.x) / 2,
    bedTop - box.min.y,
    -(box.min.z + box.max.z) / 2 + 0.02,
  );
  root.updateMatrixWorld(true);
  let low = null;
  if (orient === 'doggy') {
    const y = boneLowY(model, ['leftLowerLeg', 'rightLowerLeg', 'leftHand', 'rightHand']);
    if (y != null) root.position.y += bedTop - y + 0.035;
  } else if (orient === 'kneel') {
    const y = boneLowY(model, ['leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']);
    if (y != null) root.position.y += bedTop - y + 0.04;
  } else {
    low = bodyLowY(root);
    if (low) root.position.y += bedTop - low.y + 0.002;
  }
  root.updateMatrixWorld(true);
  model.layInfo = low;
  model.bedTop = bedTop;
  if (orient === 'doggy') plantDoggyHands(model, bedTop);
  if (model.vrm.springBoneManager) model.vrm.springBoneManager.setInitState();
}

function vrmNames(files) {
  const names = [];
  for (const name of files) {
    if (typeof name !== 'string' || !/\.vrm$/i.test(name)) continue;
    const base = name.split(/[/\\]/).pop();
    if (!base || base.includes('..')) continue;
    names.push(base);
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ja'));
}

function fetchSoon(url) {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
  return fetch(url, { cache: 'no-store', signal });
}

async function listFromGitHubPages() {
  const host = location.hostname;
  const suffix = '.github.io';
  if (!host.endsWith(suffix)) return null;
  const owner = host.slice(0, -suffix.length);
  if (!owner || owner.includes('.')) return null;
  const parts = location.pathname.split('/').filter(Boolean);
  const repo = parts.length ? parts[0] : `${owner}.github.io`;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/assets/VRM`;
  const res = await fetchSoon(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data)) return null;
  return data.filter(item => item && item.type === 'file').map(item => item.name);
}

export async function listVrmFiles() {
  try {
    const res = await fetchSoon('./api/vrms');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.files)) return vrmNames(data.files);
    }
  } catch { /* GitHub Pages など API のない静的ホスト */ }
  try {
    const res = await fetchSoon(VRM_DIR);
    if (res.ok) {
      const html = await res.text();
      const names = [];
      const re = /href="([^"]+)"/gi;
      let match;
      while ((match = re.exec(html))) {
        let href = match[1].split('?')[0];
        if (!href || href.endsWith('/')) continue;
        try { href = decodeURIComponent(href); } catch { continue; }
        names.push(href);
      }
      const listed = vrmNames(names);
      if (listed.length) return listed;
    }
  } catch { /* ディレクトリ一覧を返さないホスト */ }
  try {
    const listed = await listFromGitHubPages();
    if (listed) {
      const names = vrmNames(listed);
      if (names.length) return names;
    }
  } catch { /* 公開前や API 制限時は同梱の一覧へ */ }
  try {
    const res = await fetch(VRM_DIR + 'vrms.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const files = Array.isArray(data) ? data : data.files;
      if (Array.isArray(files)) return vrmNames(files);
    }
  } catch { /* 一覧ファイルが無い */ }
  return [];
}

export function loadCharacter(file) {
  const safe = String(file || '').split(/[/\\]/).pop();
  if (!safe || !/\.vrm$/i.test(safe) || safe.includes('..')) {
    return Promise.reject(new Error('VRM のファイル名が不正です'));
  }
  const url = VRM_DIR + encodeURIComponent(safe) + '?t=' + Date.now();
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      const vrm = gltf.userData.vrm;
      if (!vrm) { reject(new Error('VRM として読めませんでした')); return; }
      const model = prepare(vrm);
      model.file = safe;
      const meta = vrm.meta || {};
      model.vrm0 = meta.metaVersion === '0';
      model.metaName = meta.name || meta.title || safe.replace(/\.vrm$/i, '');
      const authors = Array.isArray(meta.authors) ? meta.authors.filter(Boolean) : [];
      if (!authors.length && meta.author) authors.push(meta.author);
      model.metaAuthors = authors;
      resolve(model);
    }, undefined, reject);
  });
}
