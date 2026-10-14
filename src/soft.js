// 指先・掌が触れた頂点を押し込み、柔らかい部位は揺れて戻る。
import * as THREE from 'three';

const _inv = new THREE.Matrix4();
const _pose = new THREE.Matrix4();
const _local = new THREE.Vector3();
const _at = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _push = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _cWorld = Array.from({ length: 24 }, () => new THREE.Vector3());
const _cLocal = Array.from({ length: 24 }, () => new THREE.Vector3());
const _cWin = new Array(24);

function nearestRegion(point, centers, world) {
  if (!centers?.length) return null;
  let best = null;
  let bestD = Infinity;
  let second = Infinity;
  for (const center of centers) {
    const d = point.distanceTo(world ? center.world : center.local);
    if (d < bestD) {
      second = bestD;
      best = center;
      bestD = d;
    } else if (d < second) second = d;
  }
  if (!best || bestD > best.reach) return null;
  if (second < bestD + 0.01) return null;
  return best;
}

function poseMatrix(mesh, boneIndex, target) {
  const bone = mesh.skeleton.bones[boneIndex];
  target.copy(mesh.bindMatrixInverse);
  target.multiply(bone.matrixWorld);
  target.multiply(mesh.skeleton.boneInverses[boneIndex]);
  target.multiply(mesh.bindMatrix);
  return target;
}

function applyLinear(m, v, out) {
  const e = m.elements;
  const x = v.x, y = v.y, z = v.z;
  out.set(
    e[0] * x + e[4] * y + e[8] * z,
    e[1] * x + e[5] * y + e[9] * z,
    e[2] * x + e[6] * y + e[10] * z,
  );
}

function fleshResponse(region) {
  if (region === 3 || region === 4) return { give: 1, reach: 4.2, cap: 0.05, bulge: 0, stiff: 8.5, damp: 5.2, drag: 0.8, press: true };
  if (region === 5) return { give: 1.5, reach: 2.4, cap: 0.048, bulge: 0.034, stiff: 9.5, damp: 4.2, drag: 0.5 };
  if (region > 0) return { give: 1.35, reach: 2.35, cap: 0.068, bulge: 0.04, stiff: 16, damp: 6.2, drag: 0.25 };
  return { give: 0.95, reach: 1.25, cap: 0.028, bulge: 0, stiff: 17, damp: 7.2, drag: 0.28 };
}

export function makeSoft(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const rest = new Float32Array(pos.array);
  const softA = geo.attributes.aSoft || null;
  const regionA = geo.attributes.aRegion || null;
  const oilA = geo.attributes.aOil || null;
  const flushA = geo.attributes.aFlush || null;
  const disp = new Float32Array(pos.count * 3);
  const vel = new Float32Array(pos.count * 3);
  const kind = mesh.userData.kind || 'body';
  const flesh = !!mesh.userData.flesh;
  const ud = mesh.userData;
  ud.jiggle = new THREE.Vector3();
  ud.jVel = new THREE.Vector3();
  ud.base = mesh.position.clone();
  ud.squash = 0;
  ud.squashVel = 0;
  const softOf = i => softA ? softA.getX(i) : 0.3;
  const skinned = !!(mesh.isSkinnedMesh && mesh.skeleton && mesh.bindMatrixInverse);
  const domBone = skinned ? new Int16Array(pos.count) : null;
  const boneInv = skinned ? mesh.skeleton.bones.map(() => new THREE.Matrix4()) : null;
  const boneFresh = skinned ? new Uint8Array(mesh.skeleton.bones.length) : null;
  const lastHand = new Map();
  if (skinned) {
    const idx = geo.attributes.skinIndex;
    const wgt = geo.attributes.skinWeight;
    const inf = idx?.itemSize || 4;
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < inf; k++) {
        const w = wgt.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = Math.round(idx.getComponent(i, k));
        }
      }
      domBone[i] = best;
    }
    const bones = mesh.skeleton.bones;
    for (const center of ud.regionCenters || []) {
      center.world = new THREE.Vector3();
      center.boneIndex = -1;
      if (!center.bone) continue;
      for (let i = 0; i < bones.length; i++) {
        if (bones[i].name === center.bone) {
          center.boneIndex = i;
          break;
        }
      }
    }
  }

  function visible() {
    for (let p = mesh; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  function update(dt, contacts, time) {
    const drawn = visible();
    _inv.copy(mesh.matrixWorld).invert();
    const sc = mesh.getWorldScale(_scale);
    const scAvg = (Math.abs(sc.x) + Math.abs(sc.y) + Math.abs(sc.z)) / 3 || 1;
    const dispScale = ud.dispScale || 1;
    if (drawn && !contacts.length && ud.idle && kind !== 'breast' && kind !== 'glute') {
      return { touch: 0, hard: 0, slide: 0 };
    }
    let touch = 0, hard = 0, slide = 0, squashHit = 0;
    let energy = 0;
    const n = pos.count;
    let any = false;
    const centers = ud.regionCenters;
    const contactN = Math.min(contacts.length, _cLocal.length);
    if (skinned && centers?.length && contactN) {
      for (const center of centers) {
        if (center.boneIndex >= 0) {
          poseMatrix(mesh, center.boneIndex, _pose);
          _pose.premultiply(mesh.matrixWorld);
          center.world.copy(center.local).applyMatrix4(_pose);
        } else center.world.copy(center.local).applyMatrix4(mesh.matrixWorld);
      }
    }
    if (skinned) boneFresh.fill(0);
    for (let ci = 0; ci < contactN; ci++) {
      const c = contacts[ci];
      _cWorld[ci].set(c.x, c.y, c.z);
      _cLocal[ci].copy(_cWorld[ci]).applyMatrix4(_inv);
      const prev = c.id ? lastHand.get(c.id) : null;
      if (prev) {
        c._wdx = c.x - prev.x;
        c._wdy = c.y - prev.y;
        c._wdz = c.z - prev.z;
        const hop = Math.hypot(c._wdx, c._wdy, c._wdz);
        if (hop > 0.03) {
          const m = 0.03 / hop;
          c._wdx *= m; c._wdy *= m; c._wdz *= m;
        }
      } else {
        c._wdx = 0; c._wdy = 0; c._wdz = 0;
      }
      _cWin[ci] = nearestRegion(skinned ? _cWorld[ci] : _cLocal[ci], centers, skinned);
    }

    for (let i = 0; i < n; i++) {
      const s = softOf(i);
      const region = regionA ? regionA.getX(i) : 0;
      const ix = i * 3;
      let vx = rest[ix], vy = rest[ix + 1], vz = rest[ix + 2];
      if (flesh && kind === 'body') {
        const chest = Math.exp(-((vz - 0.28) ** 2) / 0.012);
        if (vy > -0.01) vy += Math.sin(time * 1.7) * 0.004 * chest;
      }
      let ox = 0, oy = 0, oz = 0;
      if (drawn && contactN) {
        for (let ci = 0; ci < contactN; ci++) {
          const c = contacts[ci];
          const win = _cWin[ci];
          if (region > 0 && (!win || win.region !== region)) continue;
          const resp = fleshResponse(region);
          if (skinned) {
            const bi = domBone[i];
            if (!boneFresh[bi]) {
              poseMatrix(mesh, bi, boneInv[bi]);
              boneInv[bi].invert();
              boneFresh[bi] = 1;
            }
            _at.copy(_cLocal[ci]).applyMatrix4(boneInv[bi]);
          } else _at.copy(_cLocal[ci]);
          const R = c.radius * resp.reach / scAvg;
          const dx = vx - _at.x, dy = vy - _at.y, dz = vz - _at.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist >= R || dist < 1e-5) continue;
          const pen = (R - dist) / R;
          const sq = c.squeeze ? 1.15 : 1;
          let sink = 0;
          if (resp.press && win) {
            if (win.inward) _push.copy(win.inward);
            else _push.set(win.local.x - _at.x, win.local.y - _at.y, win.local.z - _at.z);
            if (_push.lengthSq() < 1e-8) _push.set(dx, dy, dz);
            _push.normalize();
            const depth = Math.min(0.045, Math.pow(pen, 0.45) * 0.042 * Math.min(c.pressure, 1.8) * sq);
            ox += _push.x * depth;
            oy += _push.y * depth;
            oz += _push.z * depth;
            sink = depth;
            if (resp.drag && (c._wdx || c._wdy || c._wdz)) {
              _delta.set(c._wdx, c._wdy, c._wdz);
              if (skinned) {
                applyLinear(_inv, _delta, _delta);
                applyLinear(boneInv[domBone[i]], _delta, _delta);
              }
              _delta.addScaledVector(_push, -_delta.dot(_push));
              const follow = resp.drag * Math.min(1, pen * 1.5);
              ox += _delta.x * follow;
              oy += _delta.y * follow;
              oz += _delta.z * follow;
            }
            _radial.set(dx, dy, dz);
            _radial.addScaledVector(_push, -_radial.dot(_push));
            const rl = _radial.length();
            if (rl > 1e-4) {
              const ring = 4 * pen * (1 - pen);
              const bulge = Math.min(resp.bulge, depth * 0.35) * ring;
              ox += _radial.x / rl * bulge;
              oy += _radial.y / rl * bulge;
              oz += _radial.z / rl * bulge;
            }
          } else {
            const k = pen * pen * (0.35 + s) * c.pressure * resp.give * sq;
            const amp = (0.018 + s * 0.045) * dispScale;
            sink = k * amp;
            _push.set(dx / dist, dy / dist, dz / dist);
            ox += _push.x * sink;
            oy += _push.y * sink;
            oz += _push.z * sink;
            if (resp.drag && (c._wdx || c._wdy || c._wdz)) {
              _delta.set(c._wdx, c._wdy, c._wdz);
              if (skinned) {
                applyLinear(_inv, _delta, _delta);
                applyLinear(boneInv[domBone[i]], _delta, _delta);
              }
              const follow = resp.drag * Math.min(1.3, pen * 1.8) * sq;
              ox += _delta.x * follow;
              oy += _delta.y * follow;
              oz += _delta.z * follow;
            }
            if (region > 0 && win) {
              _radial.set(vx - win.local.x, vy - win.local.y, vz - win.local.z);
              _radial.addScaledVector(_push, -_radial.dot(_push));
              const rl = _radial.length();
              if (rl > 1e-4) {
                const bulge = Math.min(resp.bulge, sink * 0.72);
                ox += _radial.x / rl * bulge;
                oy += _radial.y / rl * bulge;
                oz += _radial.z / rl * bulge;
              }
            }
          }
          any = true;
          const w = pen * s;
          touch += w * (c.slide > 0.025 ? 1 : 0.35);
          if (c.pressure > 1.25 && c.slide < 0.04) hard += pen;
          slide = Math.max(slide, c.slide);
          if ((kind === 'breast' || kind === 'glute' || region > 0) && s > 0.6) squashHit = Math.max(squashHit, pen * c.pressure * (c.squeeze ? 1.35 : 0.85));
          if (flesh && oilA && c.oil) oilA.setX(i, Math.min(1, oilA.getX(i) + dt * 1.6 * pen));
          if (flesh && flushA) flushA.setX(i, Math.min(1, flushA.getX(i) + dt * 1.1 * pen * c.pressure));
          c.hit = (c.hit || 0) + w;
          c.softHit = Math.max(c.softHit || 0, s);
        }
      }
      const respAll = fleshResponse(region);
      if ((region === 3 || region === 4) && centers) {
        const hub = centers.find(c => c.region === region);
        if (hub) {
          const px = vx + ox;
          const py = vy + oy;
          const pz = vz + oz;
          const r0 = Math.hypot(vx - hub.local.x, vy - hub.local.y, vz - hub.local.z);
          const r1 = Math.hypot(px - hub.local.x, py - hub.local.y, pz - hub.local.z);
          const limit = r0 + 0.012;
          if (r1 > limit && r1 > 1e-6) {
            const fit = limit / r1;
            ox = hub.local.x + (px - hub.local.x) * fit - vx;
            oy = hub.local.y + (py - hub.local.y) * fit - vy;
            oz = hub.local.z + (pz - hub.local.z) * fit - vz;
          }
        }
      }
      const maxP = Math.min(respAll.cap, (0.01 + s * 0.034) * dispScale * (region > 0 ? 1.7 : 1));
      const plen = Math.hypot(ox, oy, oz);
      if (plen > maxP) {
        const m = maxP / plen;
        ox *= m; oy *= m; oz *= m;
      }
      const stiff = respAll.stiff;
      const damp = respAll.damp;
      vel[ix] += ((ox - disp[ix]) * stiff - vel[ix] * damp) * dt;
      vel[ix + 1] += ((oy - disp[ix + 1]) * stiff - vel[ix + 1] * damp) * dt;
      vel[ix + 2] += ((oz - disp[ix + 2]) * stiff - vel[ix + 2] * damp) * dt;
      disp[ix] += vel[ix] * dt;
      disp[ix + 1] += vel[ix + 1] * dt;
      disp[ix + 2] += vel[ix + 2] * dt;
      const dlen = Math.hypot(disp[ix], disp[ix + 1], disp[ix + 2]);
      if (dlen > maxP * 1.35) {
        const m = (maxP * 1.35) / dlen;
        disp[ix] *= m; disp[ix + 1] *= m; disp[ix + 2] *= m;
      }
      pos.setXYZ(i, vx + disp[ix], vy + disp[ix + 1], vz + disp[ix + 2]);
      energy = Math.max(energy, Math.abs(disp[ix]) + Math.abs(disp[ix + 1]) + Math.abs(disp[ix + 2]) + Math.abs(vel[ix]) + Math.abs(vel[ix + 1]) + Math.abs(vel[ix + 2]));
      if (flushA) {
        const f = flushA.getX(i);
        if (f > 0) flushA.setX(i, Math.max(0, f - dt * 0.28));
      }
      if (oilA) {
        const o = oilA.getX(i);
        if (o > 0) oilA.setX(i, Math.max(0, o - dt * 0.012));
      }
    }
    pos.needsUpdate = true;
    if (oilA) oilA.needsUpdate = true;
    if (flushA) flushA.needsUpdate = true;
    ud.idle = !any && energy < 1e-4 * dispScale;
    if (!ud.keepNormals && (any || kind === 'breast' || kind === 'glute')) geo.computeVertexNormals();

    if (kind === 'breast' || kind === 'glute') {
      const target = Math.min(kind === 'breast' ? 0.58 : 0.42, squashHit);
      ud.squashVel += ((target - ud.squash) * 26 - ud.squashVel * 7.5) * dt;
      ud.squash += ud.squashVel * dt;
      ud.squash = THREE.MathUtils.clamp(ud.squash, -0.05, 0.65);
      const q = Math.max(0, ud.squash);
      mesh.scale.set(1 + q * 0.48, 1 - q * 0.52, 1 + q * 0.4);
      const breathe = Math.sin(time * 1.7) * 0.0032;
      ud.jVel.y += (breathe * 0.4 - ud.jiggle.y) * 8 * dt;
      ud.jVel.multiplyScalar(Math.max(0, 1 - dt * 3.2));
      if (squashHit > 0.2) ud.jVel.y -= squashHit * dt * 0.15;
      ud.jiggle.addScaledVector(ud.jVel, dt);
      ud.jiggle.y += ((breathe - ud.jiggle.y) * 2) * dt;
      if (ud.jiggle.length() > 0.03) ud.jiggle.setLength(0.03);
      mesh.position.copy(ud.base).add(ud.jiggle);
    }
    for (let ci = 0; ci < contactN; ci++) {
      const c = contacts[ci];
      if (!c.id) continue;
      let p = lastHand.get(c.id);
      if (!p) {
        p = new THREE.Vector3();
        lastHand.set(c.id, p);
      }
      p.set(c.x, c.y, c.z);
    }
    return { touch, hard, slide };
  }

  function reset() {
    disp.fill(0);
    vel.fill(0);
    if (oilA) for (let i = 0; i < oilA.count; i++) oilA.setX(i, 0);
    if (flushA) for (let i = 0; i < flushA.count; i++) flushA.setX(i, 0);
    pos.array.set(rest);
    pos.needsUpdate = true;
    ud.squash = 0;
    ud.squashVel = 0;
    ud.jiggle.set(0, 0, 0);
    ud.jVel.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.position.copy(ud.base);
    if (!ud.keepNormals) geo.computeVertexNormals();
  }

  return { mesh, update, reset, kind, flesh };
}
