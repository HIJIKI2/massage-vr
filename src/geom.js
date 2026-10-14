// 手続き的な人体・衣装メッシュ。単位はメートル。
import * as THREE from 'three';

export class Builder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.soft = [];
    this.oil = [];
    this.flush = [];
    this.idx = [];
  }
  get count() { return this.pos.length / 3; }
  v(x, y, z, u, vv, s) {
    this.pos.push(x, y, z);
    this.uv.push(u, vv);
    this.soft.push(s);
    this.oil.push(0);
    this.flush.push(0);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
}

function buildFrames(pts) {
  const frames = [];
  let prevN = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const t = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    if (t.lengthSq() < 1e-10) t.set(0, 0, 1);
    t.normalize();
    const n = prevN.clone().addScaledVector(t, -prevN.dot(t));
    if (n.lengthSq() < 1e-8) {
      const alt = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      n.copy(alt).addScaledVector(t, -alt.dot(t));
    }
    n.normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    frames.push({ n, b });
    prevN.copy(n);
  }
  return frames;
}

function linkRings(builder, rings) {
  const seg = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg;
      builder.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
    }
  }
}

function capRing(builder, ring, cx, cy, cz, soft, outward) {
  const ci = builder.v(cx, cy, cz, 0.5, outward ? 0 : 1, soft);
  for (let k = 0; k < ring.length; k++) {
    const k2 = (k + 1) % ring.length;
    if (outward) builder.tri(ci, ring[k2], ring[k]);
    else builder.tri(ci, ring[k], ring[k2]);
  }
}

export function addProfile(builder, slices, seg, softAt, radiusMul) {
  const rings = [];
  slices.forEach((sl, i) => {
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const m = radiusMul ? radiusMul(a, sl) : 1;
      const x = (sl.x || 0) + Math.cos(a) * sl.rx * m;
      const y = (sl.y || 0) + Math.sin(a) * sl.ry * m;
      ring.push(builder.v(x, y, sl.z, k / seg, i / Math.max(1, slices.length - 1), softAt(x, y, sl.z)));
    }
    rings.push(ring);
  });
  linkRings(builder, rings);
  return rings;
}

export function addRope(builder, pts, seg, soft, capEnd = true) {
  const frames = buildFrames(pts);
  const rings = [];
  pts.forEach((p, i) => {
    const ring = [];
    const { n, b } = frames[i];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      ring.push(builder.v(
        p.x + n.x * c * p.r + b.x * s * p.r,
        p.y + n.y * c * p.r + b.y * s * p.r,
        p.z + n.z * c * p.r + b.z * s * p.r,
        k / seg, i / Math.max(1, pts.length - 1), soft,
      ));
    }
    rings.push(ring);
  });
  linkRings(builder, rings);
  if (capEnd) {
    const p = pts[pts.length - 1];
    capRing(builder, rings[rings.length - 1], p.x, p.y, p.z, soft, true);
  }
  return rings;
}

export function addEllipsoid(builder, cx, cy, cz, rx, ry, rz, nu, nv, soft) {
  const start = builder.count;
  for (let iv = 0; iv <= nv; iv++) {
    const phi = (iv / nv) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let iu = 0; iu <= nu; iu++) {
      const th = (iu / nu) * Math.PI * 2;
      const x = Math.cos(th) * sp, y = cp, z = Math.sin(th) * sp;
      builder.v(cx + x * rx, cy + y * ry, cz + z * rz, iu / nu, iv / nv, soft);
    }
  }
  const row = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = start + iv * row + iu;
      const c = a + row;
      builder.quad(a, c, c + 1, a + 1);
    }
  }
}

function orientOutward(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  let dot = 0;
  const step = Math.max(1, Math.floor(p.count / 60));
  for (let i = 0; i < p.count; i += step) {
    dot += (p.getX(i) - c.x) * n.getX(i) + (p.getY(i) - c.y) * n.getY(i) + (p.getZ(i) - c.z) * n.getZ(i);
  }
  if (dot < 0 && geo.index) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i];
      idx[i] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

export function finalize(builder) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(builder.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uv, 2));
  g.setAttribute('aSoft', new THREE.Float32BufferAttribute(builder.soft, 1));
  g.setAttribute('aOil', new THREE.Float32BufferAttribute(builder.oil, 1));
  g.setAttribute('aFlush', new THREE.Float32BufferAttribute(builder.flush, 1));
  g.setIndex(builder.idx);
  orientOutward(g);
  g.computeBoundingSphere();
  g.boundingSphere.radius += 0.06;
  return g;
}

export function ellipsoidGeo(rx, ry, rz, soft, nu = 22, nv = 16) {
  const b = new Builder();
  addEllipsoid(b, 0, 0, 0, rx, ry, rz, nu, nv, soft);
  return finalize(b);
}

export function profileGeo(slices, seg, softAt, radiusMul) {
  const b = new Builder();
  addProfile(b, slices, seg, softAt, radiusMul);
  return finalize(b);
}

export function ropeGeo(pts, seg, soft) {
  const b = new Builder();
  addRope(b, pts, seg, soft, true);
  return finalize(b);
}
