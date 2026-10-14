// 肌（オイルのてかり・血色）と布の材質。
import * as THREE from 'three';

function celRamp() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = '#5c5c66';
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = '#a8a8b4';
  g.fillRect(1, 0, 1, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(2, 0, 2, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createMaterials() {
  const ramp = celRamp();
  const toon = (color, opts = {}) => new THREE.MeshToonMaterial({
    color,
    gradientMap: ramp,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite !== false,
  });
  const skin = toon(0xffd2c2);
  skin.onBeforeCompile = (shader) => {
    shader.uniforms.uMood = { value: 0 };
    skin.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOil;\nattribute float aFlush;\nvarying float vOil;\nvarying float vFlush;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOil = aOil;\nvFlush = aFlush;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOil;\nvarying float vFlush;\nuniform float uMood;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 0.72, 0.7), clamp(vFlush * 0.85 + uMood * 0.2, 0.0, 0.8));
        diffuseColor.rgb += vec3(0.35) * vOil;`);
  };
  skin.customProgramCacheKey = () => 'skin-toon-oil-v1';

  const skinPlain = toon(0xffd2c2);
  const lip = toon(0xe07080);
  const areola = toon(0xe7a0a4);
  const nipple = toon(0xd47880);
  const hair = toon(0x3a241c);
  const sclera = toon(0xfff8f4);
  const iris = toon(0x6a3a28);
  const pupil = toon(0x1a120e);
  const brow = toon(0x3a241c);
  const blush = new THREE.MeshBasicMaterial({ color: 0xff8aa0, transparent: true, opacity: 0.0, depthWrite: false });
  const mouthIn = toon(0xc45a6a);
  const teeth = toon(0xfff6f0);

  function cloth(color, opts = {}) {
    return toon(color, { side: THREE.DoubleSide, transparent: opts.transparent, opacity: opts.opacity, depthWrite: opts.depthWrite });
  }

  return {
    skin, skinPlain, lip, areola, nipple, hair, sclera, iris, pupil, brow, blush, mouthIn, teeth, cloth,
    nurse: cloth(0xf7f8fb, { roughness: 0.72 }),
    nurseTrim: cloth(0xc4475a, { roughness: 0.6 }),
    olBlouse: cloth(0xf3f1ec, { roughness: 0.75 }),
    olSkirt: cloth(0x2a3144, { roughness: 0.7 }),
    belt: cloth(0x1b1c22, { roughness: 0.45 }),
    sailor: cloth(0x1b2a58, { roughness: 0.62 }),
    sailorWhite: cloth(0xf4f6f8, { roughness: 0.7 }),
    scarf: cloth(0xc43b4e, { roughness: 0.65 }),
    bikini: cloth(0xd25d78, { roughness: 0.55 }),
    bra: cloth(0xf6f1ee, { roughness: 0.8 }),
    panty: cloth(0xf4eef0, { roughness: 0.8 }),
    stocking: cloth(0xf7f7f8, { roughness: 0.25, transparent: true, opacity: 0.42, depthWrite: false }),
    pantyhose: cloth(0xd7b5a4, { roughness: 0.28, transparent: true, opacity: 0.38, depthWrite: false }),
    sock: cloth(0xf5f6f8, { roughness: 0.75 }),
  };
}
