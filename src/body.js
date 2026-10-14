// 仰向けの成人女性。ローカル座標: +Y 腹側、+Z 頭側、+X 向かって右（本人の左）。
import * as THREE from 'three';
import { profileGeo, ropeGeo, ellipsoidGeo } from './geom.js';

export const TORSO = [
  { z: 0.50, y: 0.012, rx: 0.04, ry: 0.038 },
  { z: 0.45, y: 0.004, rx: 0.09, ry: 0.062 },
  { z: 0.40, y: -0.002, rx: 0.178, ry: 0.086 },
  { z: 0.34, y: -0.006, rx: 0.148, ry: 0.088 },
  { z: 0.275, y: -0.008, rx: 0.134, ry: 0.084 },
  { z: 0.20, y: -0.01, rx: 0.122, ry: 0.078 },
  { z: 0.13, y: -0.012, rx: 0.114, ry: 0.076 },
  { z: 0.05, y: -0.016, rx: 0.136, ry: 0.088 },
  { z: -0.02, y: -0.02, rx: 0.166, ry: 0.098 },
  { z: -0.09, y: -0.018, rx: 0.15, ry: 0.09 },
];

export function armPoints(sign) {
  return [
    { x: sign * 0.09, y: 0.0, z: 0.40, r: 0.052 },
    { x: sign * 0.155, y: -0.002, z: 0.36, r: 0.042 },
    { x: sign * 0.21, y: -0.006, z: 0.24, r: 0.036 },
    { x: sign * 0.225, y: -0.008, z: 0.10, r: 0.032 },
    { x: sign * 0.20, y: -0.006, z: -0.02, r: 0.028 },
    { x: sign * 0.17, y: -0.004, z: -0.09, r: 0.022 },
  ];
}

export function legPoints(sign) {
  return [
    { x: sign * 0.058, y: -0.018, z: -0.06, r: 0.068 },
    { x: sign * 0.062, y: -0.016, z: -0.20, r: 0.058 },
    { x: sign * 0.058, y: -0.014, z: -0.36, r: 0.048 },
    { x: sign * 0.052, y: -0.01, z: -0.50, r: 0.04 },
    { x: sign * 0.048, y: -0.006, z: -0.64, r: 0.034 },
    { x: sign * 0.046, y: -0.004, z: -0.76, r: 0.028 },
  ];
}

function torsoSoft(x, y, z) {
  let s = 0.32;
  const belly = Math.exp(-((z - 0.11) ** 2) / 0.005) * Math.exp(-(x * x) / 0.008);
  if (y > 0.0) s += belly * 0.5;
  if (z < 0.0 && z > -0.1 && y > -0.02) s = Math.max(s, 0.45);
  return Math.min(0.82, s);
}

function part(root, geo, mat, x, y, z, kind, rotX = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.x = rotX;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.flesh = true;
  mesh.userData.kind = kind;
  mesh.frustumCulled = false;
  pivot.add(mesh);
  root.add(pivot);
  return mesh;
}

export function createWoman(mats) {
  const root = new THREE.Group();
  root.name = 'woman';
  const flesh = [];

  const torso = new THREE.Mesh(profileGeo(TORSO, 28, torsoSoft), mats.skin);
  torso.castShadow = torso.receiveShadow = true;
  torso.userData.flesh = true;
  torso.userData.kind = 'body';
  torso.frustumCulled = false;
  root.add(torso);
  flesh.push(torso);

  const addE = (rx, ry, rz, x, y, z, kind, soft, rotX = 0, nu = 20, nv = 14) => {
    const mesh = part(root, ellipsoidGeo(rx, ry, rz, soft, nu, nv), mats.skin, x, y, z, kind, rotX);
    flesh.push(mesh);
    return mesh;
  };

  addE(0.072, 0.088, 0.092, 0, 0.03, 0.625, 'body', 0.2, 0, 24, 18);
  addE(0.046, 0.044, 0.055, 0, 0.012, 0.52, 'body', 0.22);
  addE(0.038, 0.034, 0.032, 0, 0.055, 0.548, 'body', 0.28, 0, 14, 10);

  for (const sign of [1, -1]) {
    addE(0.055, 0.045, 0.05, sign * 0.15, 0.0, 0.385, 'body', 0.35, 0, 14, 10);
    const arm = new THREE.Mesh(ropeGeo(armPoints(sign), 14, 0.3), mats.skin);
    arm.castShadow = arm.receiveShadow = true;
    arm.userData.flesh = true;
    arm.userData.kind = 'body';
    arm.frustumCulled = false;
    root.add(arm);
    flesh.push(arm);

    const leg = new THREE.Mesh(ropeGeo(legPoints(sign), 16, 0.5), mats.skin);
    leg.castShadow = leg.receiveShadow = true;
    leg.userData.flesh = true;
    leg.userData.kind = 'body';
    leg.frustumCulled = false;
    root.add(leg);
    flesh.push(leg);

    addE(0.03, 0.022, 0.048, sign * 0.048, -0.002, -0.83, 'body', 0.2, 0, 12, 10);
  }

  const breastL = addE(0.076, 0.066, 0.072, -0.07, 0.062, 0.275, 'breast', 1, 0, 22, 16);
  const breastR = addE(0.076, 0.066, 0.072, 0.07, 0.062, 0.275, 'breast', 1, 0, 22, 16);
  const gluteL = addE(0.078, 0.07, 0.076, -0.058, -0.078, -0.02, 'glute', 1, Math.PI, 20, 14);
  const gluteR = addE(0.078, 0.07, 0.076, 0.058, -0.078, -0.02, 'glute', 1, Math.PI, 20, 14);

  const nipples = [];
  const areolae = [];
  for (const breast of [breastL, breastR]) {
    const areola = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), mats.areola);
    areola.scale.set(1, 0.42, 1);
    areola.position.set(0, 0.06, 0);
    areola.castShadow = true;
    const nipple = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 10), mats.nipple);
    nipple.scale.set(1, 1.15, 1);
    nipple.position.set(0, 0.07, 0);
    nipple.castShadow = true;
    breast.add(areola, nipple);
    areolae.push(areola);
    nipples.push(nipple);
  }

  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of flesh) box.union(new THREE.Box3().setFromObject(m));

  return {
    root,
    flesh,
    breasts: [breastL, breastR],
    glutes: [gluteL, gluteR],
    nipples,
    areolae,
    bounds: { minY: box.min.y, maxY: box.max.y },
  };
}
