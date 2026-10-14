// 表情: リラックスで目を細め、頬を染め、口がわずかに開く。強すぎる力では眉が寄る。
import * as THREE from 'three';

export function createFace(mats, parent) {
  const g = new THREE.Group();
  g.name = 'face';
  parent.add(g);

  const hair = mats.hair;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), hair);
  cap.scale.set(0.09, 0.05, 0.1);
  cap.position.set(0, 0.02, 0.68);
  const bangs = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hair);
  bangs.scale.set(0.082, 0.02, 0.028);
  bangs.position.set(0, 0.1, 0.72);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hair);
  back.scale.set(0.095, 0.04, 0.12);
  back.position.set(0, -0.015, 0.6);
  const lockL = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), hair);
  lockL.scale.set(0.028, 0.018, 0.16);
  lockL.position.set(-0.078, 0.04, 0.52);
  const lockR = lockL.clone();
  lockR.position.x = 0.078;
  g.add(cap, bangs, back, lockL, lockR);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.16), faceMat);
  decal.position.set(0, 0.128, 0.61);
  decal.rotation.x = -Math.PI / 2;
  decal.renderOrder = 2;
  g.add(decal);

  let blinkT = 1.6;
  let lastPaint = -1;

  function paint(relax, tense, shut) {
    const w = 512, h = 512;
    ctx.clearRect(0, 0, w, h);
    // キャンバス上側があご（足側）、下側が額（頭頂側）。
    const eye = (cx, open) => {
      const cy = 340;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, Math.max(0.08, open));
      ctx.fillStyle = '#fff8f6';
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a241c';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
      if (open < 0.2) return;
      ctx.fillStyle = '#6b3a28';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, 32, 38 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a120e';
      ctx.beginPath();
      ctx.arc(cx, cy + 14, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx - 14, cy - 10, 10, 0, Math.PI * 2);
      ctx.fill();
    };
    const open = 1 - shut * 0.92;
    eye(160, open);
    eye(352, open);
    ctx.strokeStyle = '#3a241c';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(96, 430);
    ctx.quadraticCurveTo(160, 408 - tense * 18, 224, 432);
    ctx.moveTo(288, 432);
    ctx.quadraticCurveTo(352, 408 - tense * 18, 416, 430);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,120,150,${0.22 + relax * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(108, 250, 42, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(404, 250, 42, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e07080';
    ctx.lineWidth = 9;
    ctx.beginPath();
    const smile = 14 + relax * 20;
    ctx.moveTo(210, 150);
    ctx.quadraticCurveTo(256, 150 - smile, 302, 150);
    ctx.stroke();
    tex.needsUpdate = true;
  }
  paint(0.15, 0, 0);
  lastPaint = 0;

  function update(dt, mood) {
    const relax = THREE.MathUtils.clamp(mood.ease - mood.tension * 0.55, 0, 1);
    const tense = THREE.MathUtils.clamp(mood.tension, 0, 1);
    blinkT -= dt;
    if (blinkT < 0) blinkT = 2.4 + Math.random() * 3.2;
    const blink = blinkT > 2.2 ? Math.sin((2.35 - blinkT) / 0.15 * Math.PI) : 0;
    const shut = Math.min(1, relax * 0.45 + Math.max(0, blink));
    const key = (relax * 20 | 0) + (tense * 20 | 0) * 40 + (shut * 20 | 0) * 800;
    if (key !== lastPaint) { lastPaint = key; paint(relax, tense, shut); }
    if (mats.skin.userData.shader) mats.skin.userData.shader.uniforms.uMood.value = relax;
    return relax;
  }

  return { group: g, update };
}
