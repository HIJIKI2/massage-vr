// 手元の操作板。ボタン位置は描画と当たり判定で共有する。
import * as THREE from 'three';

const W = 768;
const H = 1024;
const PW = 0.58;
const PH = 0.78;

const PARTS = [
  ['head', '頭（帽子など）'],
  ['top', '上半身'],
  ['bottom', '下半身'],
  ['innerTop', '下着（上）'],
  ['innerBottom', '下着（下）'],
  ['legs', '脚（ストッキング）'],
];
const WEAR_SLOTS = 8;

export function createPanel(hasPiece) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
  mesh.name = 'panel';
  mesh.position.set(0.98, 1.18, -0.95);
  mesh.rotation.y = -Math.PI / 2 + 0.35;

  const root = new THREE.Group();
  root.add(mesh);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const buttons = layout();
  for (const b of buttons) {
    const box = new THREE.Mesh(new THREE.BoxGeometry((b.w / W) * PW, (b.h / H) * PH, 0.03), hitMat);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    box.position.set((cx / W - 0.5) * PW, (0.5 - cy / H) * PH, 0.02);
    box.userData.button = b.id;
    b._hit = box;
    mesh.add(box);
  }

  function draw(state, moodLabel) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1816';
    round(ctx, 0, 0, W, H, 28);
    ctx.fill();
    ctx.fillStyle = '#f3e6d4';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('施術メニュー', 40, 64);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#b7a898';
    let banner = state.vrmName ? 'モデル ' + state.vrmName : '成人（21歳）  体位と着脱';
    while (ctx.measureText(banner).width > 680 && banner.length > 6) banner = banner.slice(0, -1);
    ctx.fillText(banner, 40, 100);

    const paint = (b, on, disabled, text) => {
      ctx.fillStyle = disabled ? '#2a2826' : on ? '#2f6f66' : '#3a342e';
      round(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.fill();
      ctx.fillStyle = disabled ? '#6d655c' : '#f6efe6';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let line = text || b.label;
      while (ctx.measureText(line).width > b.w - 24 && line.length > 2) line = line.slice(0, -1);
      ctx.fillText(line, b.x + b.w / 2, b.y + b.h / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };

    const clothes = Array.isArray(state.clothes) ? state.clothes : null;
    const wearButtons = buttons.filter(b => b.slot === 'wear');
    wearButtons.forEach((b, i) => {
      if (clothes) {
        const piece = clothes[i];
        b.id = piece ? 'cloth:' + piece.id : '';
        b._on = !!(piece && state.clothOn[piece.id] !== false);
        b._disabled = !piece;
        b._text = piece ? `${piece.label}　${b._on ? '着用中' : '脱いでいる'}` : '';
      } else {
        const part = PARTS[i];
        const ok = !!(part && hasPiece(part[0]));
        b.id = part ? 'part:' + part[0] : '';
        b._on = !!(part && state.worn[part[0]]);
        b._disabled = !part || !ok;
        b._text = !part ? '' : (ok ? `${part[1]}　${b._on ? '着用中（押すと脱ぐ）' : '脱いでいる（押すと着る）'}` : `${part[1]}　なし`);
      }
      if (b._hit) b._hit.userData.button = b.id;
    });

    for (const b of buttons) {
      if (b.slot === 'wear') {
        if (b._text) paint(b, b._on && !b._disabled, b._disabled, b._text);
        continue;
      }
      if (b.id === 'vrm:prev' || b.id === 'vrm:next') paint(b, false, false);
      else if (b.id.startsWith('pose:')) paint(b, state.pose === b.id.slice(5), false);
      else if (b.id === 'oil') paint(b, state.oil, false);
      else if (b.id === 'joints') paint(b, !!state.joints, false);
      else if (b.id === 'all:on' || b.id === 'all:off') paint(b, false, !!(clothes && clothes.length === 0));
      else paint(b, false, false);
    }

    ctx.fillStyle = '#d9cfc3';
    ctx.font = '22px sans-serif';
    ctx.fillText(moodLabel || '', 40, 990);
    const barW = 688 * THREE.MathUtils.clamp(state.ease, 0, 1);
    ctx.fillStyle = '#3a342e';
    round(ctx, 40, 1004, 688, 12, 6); ctx.fill();
    ctx.fillStyle = '#e7a3a8';
    if (barW > 0) { round(ctx, 40, 1004, barW, 12, 6); ctx.fill(); }
    tex.needsUpdate = true;
  }

  return { group: root, mesh, buttons, draw };
}

function layout() {
  const B = [];
  B.push({ id: 'vrm:prev', label: '前のモデル', x: 36, y: 116, w: 338, h: 56 });
  B.push({ id: 'vrm:next', label: '次のモデル', x: 390, y: 116, w: 338, h: 56 });
  const poses = [['supine', '仰向け'], ['prone', 'うつ伏せ'], ['missionary', '正常位'], ['doggy', '後背位']];
  poses.forEach((o, i) => {
    const col = i % 2, row = (i / 2) | 0;
    B.push({ id: 'pose:' + o[0], label: o[1], x: 36 + col * 354, y: 186 + row * 70, w: 338, h: 60 });
  });
  B.push({ id: 'pose:cowgirl', label: '騎乗位', x: 36, y: 326, w: 696, h: 56 });
  B.push({ id: 'oil', label: 'オイル', x: 36, y: 394, w: 338, h: 56 });
  B.push({ id: 'joints', label: '関節を動かす', x: 390, y: 394, w: 338, h: 56 });
  for (let i = 0; i < WEAR_SLOTS; i++) {
    B.push({ id: '', label: '', slot: 'wear', x: 36, y: 458 + i * 46, w: 696, h: 42 });
  }
  B.push({ id: 'all:on', label: 'すべて着る', x: 36, y: 842, w: 338, h: 52 });
  B.push({ id: 'all:off', label: 'すべて脱ぐ', x: 390, y: 842, w: 338, h: 52 });
  return B;
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
