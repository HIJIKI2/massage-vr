// ナース / OL / セーラー / ビキニ。部位ごとに着脱する。
import * as THREE from 'three';
import { profileGeo, ropeGeo } from './geom.js';
import { legPoints } from './body.js';

const softCloth = () => 0.28;

function shell(slices, mat, pleat) {
  const geo = profileGeo(slices, pleat ? 36 : 28, softCloth, pleat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.kind = 'cloth';
  return mesh;
}

function cup(mat, scale) {
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.078, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), m);
  mesh.scale.set(scale, scale * 0.85, scale);
  mesh.position.set(0, 0.02, 0);
  mesh.castShadow = true;
  mesh.userData.follow = true;
  return mesh;
}

function stocking(sign, mat, zMax) {
  const pts = legPoints(sign).filter(p => p.z <= zMax).map(p => ({ ...p, r: p.r + 0.004 }));
  if (pts.length < 2) return null;
  const mesh = new THREE.Mesh(ropeGeo(pts, 14, 0.15), mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.kind = 'cloth';
  mesh.renderOrder = 2;
  return mesh;
}

function emptyPieces() {
  return { head: [], top: [], bottom: [], innerTop: [], innerBottom: [], legs: [] };
}

export function createOutfits(mats, woman) {
  const outfits = {
    nurse: buildNurse(mats, woman),
    ol: buildOL(mats, woman),
    sailor: buildSailor(mats, woman),
    bikini: buildBikini(mats, woman),
  };
  for (const o of Object.values(outfits)) woman.root.add(o.group);
  return outfits;
}

function buildNurse(mats, woman) {
  const group = new THREE.Group();
  const pieces = emptyPieces();
  const shells = [];
  const top = shell([
    { z: 0.42, y: 0.006, rx: 0.09, ry: 0.07 },
    { z: 0.36, y: 0.01, rx: 0.155, ry: 0.1 },
    { z: 0.26, y: 0.012, rx: 0.145, ry: 0.095 },
    { z: 0.17, y: 0.004, rx: 0.135, ry: 0.09 },
  ], mats.nurse);
  const skirt = shell([
    { z: 0.17, y: -0.004, rx: 0.14, ry: 0.1 },
    { z: 0.02, y: -0.008, rx: 0.19, ry: 0.13 },
    { z: -0.14, y: -0.01, rx: 0.23, ry: 0.15 },
    { z: -0.28, y: -0.01, rx: 0.25, ry: 0.16 },
  ], mats.nurse);
  group.add(top, skirt);
  shells.push(top, skirt);
  pieces.top.push(top);
  pieces.bottom.push(skirt);

  const cap = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.02, 20), mats.nurse);
  disk.rotation.x = Math.PI / 2;
  disk.position.set(0, 0.055, 0.72);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.045), mats.nurse);
  brim.position.set(0, 0.1, 0.7);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.012), mats.nurseTrim);
  stripe.position.set(0, 0.106, 0.7);
  cap.add(disk, brim, stripe);
  group.add(cap);
  pieces.head.push(cap);

  addUnderwear(group, shells, pieces, woman, mats.bra, mats.panty, 1.06);
  addDressCups(mats.nurse, woman, pieces, 1.2);
  for (const sign of [1, -1]) {
    const s = stocking(sign, mats.stocking, -0.12);
    if (s) { group.add(s); shells.push(s); pieces.legs.push(s); }
  }
  return { group, pieces, shells };
}

function buildOL(mats, woman) {
  const group = new THREE.Group();
  const pieces = emptyPieces();
  const shells = [];
  const blouse = shell([
    { z: 0.47, y: 0.012, rx: 0.075, ry: 0.058 },
    { z: 0.38, y: 0.02, rx: 0.198, ry: 0.118 },
    { z: 0.27, y: 0.026, rx: 0.17, ry: 0.12 },
    { z: 0.16, y: 0.008, rx: 0.148, ry: 0.1 },
  ], mats.olBlouse);
  const skirt = shell([
    { z: 0.15, y: -0.004, rx: 0.155, ry: 0.108 },
    { z: -0.02, y: -0.01, rx: 0.175, ry: 0.12 },
    { z: -0.22, y: -0.012, rx: 0.162, ry: 0.112 },
    { z: -0.42, y: -0.01, rx: 0.15, ry: 0.1 },
  ], mats.olSkirt);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.17, 0.028, 24), mats.belt);
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, -0.008, 0.145);
  belt.castShadow = true;
  group.add(blouse, skirt, belt);
  shells.push(blouse, skirt);
  pieces.top.push(blouse);
  pieces.bottom.push(skirt, belt);
  addUnderwear(group, shells, pieces, woman, mats.bra, mats.panty, 1.06);
  addDressCups(mats.olBlouse, woman, pieces, 1.18);
  for (const sign of [1, -1]) {
    const s = stocking(sign, mats.pantyhose, 0.2);
    if (s) { group.add(s); shells.push(s); pieces.legs.push(s); }
  }
  return { group, pieces, shells };
}

function buildSailor(mats, woman) {
  const group = new THREE.Group();
  const pieces = emptyPieces();
  const shells = [];
  const pleat = a => 1 + 0.07 * Math.cos(a * 12);
  const top = shell([
    { z: 0.46, y: 0.012, rx: 0.08, ry: 0.06 },
    { z: 0.36, y: 0.02, rx: 0.19, ry: 0.115 },
    { z: 0.24, y: 0.02, rx: 0.16, ry: 0.11 },
  ], mats.sailor);
  const skirt = shell([
    { z: 0.16, y: 0.0, rx: 0.15, ry: 0.11 },
    { z: 0.02, y: -0.004, rx: 0.24, ry: 0.15 },
    { z: -0.16, y: -0.008, rx: 0.3, ry: 0.17 },
  ], mats.sailor, pleat);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.16), mats.sailorWhite);
  collar.position.set(0, -0.02, 0.48);
  collar.rotation.x = -0.4;
  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.16), mats.scarf);
  scarf.position.set(0, 0.105, 0.38);
  scarf.rotation.x = 0.5;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 8, 20), mats.sailorWhite);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 0.02, 0.47);
  group.add(top, skirt, collar, scarf, stripe);
  shells.push(top, skirt);
  pieces.top.push(top, collar, scarf, stripe);
  pieces.bottom.push(skirt);
  addUnderwear(group, shells, pieces, woman, mats.bra, mats.panty, 1.05);
  addDressCups(mats.sailor, woman, pieces, 1.16);
  for (const sign of [1, -1]) {
    const s = stocking(sign, mats.sock, -0.18);
    if (s) { group.add(s); shells.push(s); pieces.legs.push(s); }
  }
  return { group, pieces, shells };
}

function buildBikini(mats, woman) {
  const group = new THREE.Group();
  const pieces = emptyPieces();
  const shells = [];
  const bottom = shell([
    { z: 0.02, y: -0.01, rx: 0.15, ry: 0.105 },
    { z: -0.07, y: -0.016, rx: 0.158, ry: 0.11 },
  ], mats.bikini);
  group.add(bottom);
  shells.push(bottom);
  pieces.bottom.push(bottom);
  for (const breast of woman.breasts) {
    const c = cup(mats.bikini, 1.02);
    breast.add(c);
    pieces.top.push(c);
  }
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), mats.bikini);
  string.rotation.z = Math.PI / 2;
  string.position.set(0, 0.09, 0.275);
  group.add(string);
  pieces.top.push(string);
  return { group, pieces, shells };
}

function addDressCups(mat, woman, pieces, scale) {
  for (const breast of woman.breasts) {
    const c = cup(mat, scale);
    breast.add(c);
    pieces.top.push(c);
  }
}

function addUnderwear(group, shells, pieces, woman, braMat, pantyMat, scale) {
  for (const breast of woman.breasts) {
    const c = cup(braMat, scale);
    breast.add(c);
    pieces.innerTop.push(c);
  }
  const band = shell([
    { z: 0.32, y: 0.01, rx: 0.15, ry: 0.1 },
    { z: 0.24, y: 0.012, rx: 0.145, ry: 0.098 },
  ], braMat);
  const panties = shell([
    { z: 0.02, y: -0.008, rx: 0.155, ry: 0.108 },
    { z: -0.08, y: -0.016, rx: 0.162, ry: 0.112 },
  ], pantyMat);
  group.add(band, panties);
  shells.push(band, panties);
  pieces.innerTop.push(band);
  pieces.innerBottom.push(panties);
}

export function applyWear(outfits, outfitName, worn) {
  let covered = false;
  for (const [name, o] of Object.entries(outfits)) {
    const on = name === outfitName;
    o.group.visible = on;
    for (const key of Object.keys(o.pieces)) {
      const show = on && !!worn[key];
      for (const obj of o.pieces[key]) obj.visible = show;
      if (on && show && (key === 'top' || key === 'innerTop') && o.pieces[key].length) covered = true;
    }
  }
  return covered;
}

export function hasPiece(outfits, outfitName, key) {
  return !!(outfits[outfitName].pieces[key] && outfits[outfitName].pieces[key].length);
}
