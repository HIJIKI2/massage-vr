// 薄暗い施術部屋とマッサージベッド、オイルの瓶。
import * as THREE from 'three';

export const BED_TOP = 0.78;

export function buildRoom() {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.92, metalness: 0, envMapIntensity: 0.08 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.7, envMapIntensity: 0.1 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    g.add(m);
  };
  mkWall(5.2, 2.6, 0, 1.3, -2.6, 0);
  mkWall(5.2, 2.6, 0, 1.3, 2.6, Math.PI);
  mkWall(5.2, 2.6, -2.6, 1.3, 0, Math.PI / 2);
  mkWall(5.2, 2.6, 2.6, 1.3, 0, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 2.6;
  g.add(ceil);

  const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.04), trimMat);
  windowFrame.position.set(0, 1.55, -2.57);
  const night = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ color: 0x1a2740 }));
  night.position.set(0, 1.55, -2.54);
  g.add(windowFrame, night);

  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.72, envMapIntensity: 0.12 });
  const leather = new THREE.MeshStandardMaterial({ color: 0xd9c7b0, roughness: 0.88, metalness: 0, envMapIntensity: 0.12 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 2.05), wood);
  base.position.set(0, 0.42, 0.0);
  base.castShadow = base.receiveShadow = true;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 1.95), leather);
  mattress.position.set(0, BED_TOP - 0.078, 0.0);
  mattress.castShadow = mattress.receiveShadow = true;
  g.add(base, mattress);
  for (const [x, z] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.38, 10), wood);
    leg.position.set(x, 0.19, z);
    leg.castShadow = true;
    g.add(leg);
  }
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xe7dccb, roughness: 0.96, metalness: 0, envMapIntensity: 0.08 });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.9), sheetMat);
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0, BED_TOP, 0.0);
  sheet.receiveShadow = true;
  sheet.castShadow = false;
  g.add(sheet);

  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood);
  tableTop.position.set(1.05, 0.62, 0.15);
  tableTop.castShadow = tableTop.receiveShadow = true;
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 10), wood);
  tleg.position.set(1.05, 0.3, 0.15);
  g.add(tableTop, tleg);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xf3d27a, roughness: 0.15, transmission: 0.55, thickness: 0.2, transparent: true, opacity: 0.9, envMapIntensity: 0.4,
  });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 16), glass);
  bottle.position.set(1.05, 0.72, 0.15);
  bottle.castShadow = true;
  bottle.name = 'oil';
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 12), glass);
  neck.position.y = 0.1;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
  cap.position.y = 0.132;
  bottle.add(neck, cap);
  g.add(bottle);
  const home = bottle.position.clone();

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe1b0 }));
  lamp.position.set(1.05, 0.78, -0.55);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.28, 8), trimMat);
  stand.position.set(1.05, 0.62, -0.55);
  g.add(lamp, stand);

  return { group: g, bottle, bottleHome: home, mattress };
}
