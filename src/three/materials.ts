import * as THREE from 'three';
import type { BoardTextures } from './textures';

export interface DraculaMaterials {
  // Board (Rojo Vivo & Verde)
  redSquareMat: THREE.MeshPhysicalMaterial;
  greenSquareMat: THREE.MeshPhysicalMaterial;
  frameObsidianMat: THREE.MeshStandardMaterial;
  frameRubyTrimMat: THREE.MeshPhysicalMaterial;
  tableCryptMat: THREE.MeshStandardMaterial;

  // Crimson Team (w) - Hyperrealistic Sculpted Blood-Bronze & Flesh
  redArmorMat: THREE.MeshPhysicalMaterial;
  redFleshMat: THREE.MeshStandardMaterial;
  redCapeMat: THREE.MeshStandardMaterial;
  redStoneMat: THREE.MeshStandardMaterial;
  redTrimMat: THREE.MeshStandardMaterial;
  redHornMat: THREE.MeshPhysicalMaterial;
  redPhantomMat: THREE.MeshPhysicalMaterial;
  redEyeMat: THREE.MeshStandardMaterial;
  redGemMat: THREE.MeshStandardMaterial;

  // Dark / Emerald-Shadow Team (b) - Hyperrealistic Sculpted Obsidian Steel & Necrotic Flesh
  blackArmorMat: THREE.MeshPhysicalMaterial;
  blackFleshMat: THREE.MeshStandardMaterial;
  blackCapeMat: THREE.MeshStandardMaterial;
  blackStoneMat: THREE.MeshStandardMaterial;
  blackTrimMat: THREE.MeshStandardMaterial;
  blackHornMat: THREE.MeshPhysicalMaterial;
  blackPhantomMat: THREE.MeshPhysicalMaterial;
  blackEyeMat: THREE.MeshStandardMaterial;
  blackGemMat: THREE.MeshStandardMaterial;

  // Shared hyperrealistic anatomical details
  boneMat: THREE.MeshStandardMaterial;
  eyeSocketMat: THREE.MeshStandardMaterial;
  candleWaxMat: THREE.MeshStandardMaterial;
  candleFlameMat: THREE.MeshBasicMaterial;
  candleFlameCoreMat: THREE.MeshBasicMaterial;
  candleHaloMat: THREE.MeshBasicMaterial;

  // Gore & capture cinematic materials
  bloodMat: THREE.MeshPhysicalMaterial;
  bloodPoolMat: THREE.MeshStandardMaterial;
  goreChunkMat: THREE.MeshStandardMaterial;
  fireOuterMat: THREE.MeshBasicMaterial;
  fireInnerMat: THREE.MeshBasicMaterial;
  purpleOrbMat: THREE.MeshBasicMaterial;
  purpleOrbAuraMat: THREE.MeshBasicMaterial;
  blueOrbMat: THREE.MeshBasicMaterial;
  blueOrbAuraMat: THREE.MeshBasicMaterial;
  ironSpikeMat: THREE.MeshStandardMaterial;
  mawInnerMat: THREE.MeshStandardMaterial;

  // Highlight indicators
  selectHighlightMat: THREE.MeshBasicMaterial;
  legalMoveMat: THREE.MeshBasicMaterial;
  captureMoveMat: THREE.MeshBasicMaterial;
  checkHighlightMat: THREE.MeshBasicMaterial;
  lastMoveMat: THREE.MeshBasicMaterial;

  dispose: () => void;
}

export function createDraculaMaterials(textures: BoardTextures): DraculaMaterials {
  const redSquareMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.redSquareMap,
    roughness: 0.95,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    specularIntensity: 0.0,
    envMapIntensity: 0.12,
  });

  const greenSquareMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.greenSquareMap,
    roughness: 0.95,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    specularIntensity: 0.0,
    envMapIntensity: 0.12,
  });

  const frameObsidianMat = new THREE.MeshStandardMaterial({
    color: 0x08060a,
    bumpMap: textures.stoneBumpMap,
    bumpScale: 0.008,
    roughness: 0.88,
    metalness: 0.12,
    envMapIntensity: 0.15,
  });

  const frameRubyTrimMat = new THREE.MeshPhysicalMaterial({
    color: 0xa80516,
    roughness: 0.68,
    metalness: 0.1,
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    specularIntensity: 0.08,
    envMapIntensity: 0.15,
    emissive: 0x450008,
    emissiveIntensity: 0.65,
  });

  const tableCryptMat = new THREE.MeshStandardMaterial({
    color: 0x050406,
    bumpMap: textures.stoneBumpMap,
    bumpScale: 0.008,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.1,
  });

  // === CRIMSON TEAM (w) ===
  const redArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.redArmorMap,
    bumpMap: textures.stoneBumpMap,
    bumpScale: 0.014,
    roughness: 0.3,
    metalness: 0.58,
    clearcoat: 0.68,
    clearcoatRoughness: 0.16,
  });

  const redFleshMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.redFleshMap,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.026,
    roughness: 0.66,
    metalness: 0.04,
  });

  const redCapeMat = new THREE.MeshStandardMaterial({
    color: 0x360108,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.022,
    roughness: 0.9,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const redStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.redStoneMap,
    bumpMap: textures.masonryBumpMap,
    bumpScale: 0.042,
    roughness: 0.82,
    metalness: 0.12,
  });

  const redTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1c0d10,
    roughness: 0.36,
    metalness: 0.8,
  });

  const redHornMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f0407,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.03,
    roughness: 0.3,
    metalness: 0.2,
    clearcoat: 0.5,
  });

  const redPhantomMat = new THREE.MeshPhysicalMaterial({
    color: 0x990617,
    emissive: 0x70020f,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const redEyeMat = new THREE.MeshStandardMaterial({
    color: 0xff1e34,
    emissive: 0xff0522,
    emissiveIntensity: 1.85,
    roughness: 0.08,
  });

  const redGemMat = new THREE.MeshStandardMaterial({
    color: 0xff213e,
    emissive: 0xd90724,
    emissiveIntensity: 1.35,
    roughness: 0.12,
    metalness: 0.2,
  });

  // === DARK / EMERALD-SHADOW TEAM (b) ===
  const blackArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.blackArmorMap,
    bumpMap: textures.stoneBumpMap,
    bumpScale: 0.014,
    roughness: 0.32,
    metalness: 0.68,
    clearcoat: 0.58,
    clearcoatRoughness: 0.18,
  });

  const blackFleshMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.blackFleshMap,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.028,
    roughness: 0.72,
    metalness: 0.05,
  });

  const blackCapeMat = new THREE.MeshStandardMaterial({
    color: 0x050508,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.022,
    roughness: 0.9,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const blackStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.blackStoneMap,
    bumpMap: textures.masonryBumpMap,
    bumpScale: 0.044,
    roughness: 0.84,
    metalness: 0.16,
  });

  const blackTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0f472b,
    roughness: 0.36,
    metalness: 0.7,
  });

  const blackHornMat = new THREE.MeshPhysicalMaterial({
    color: 0x070709,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.03,
    roughness: 0.28,
    metalness: 0.22,
    clearcoat: 0.5,
  });

  const blackPhantomMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e7845,
    emissive: 0x054f2b,
    emissiveIntensity: 0.58,
    roughness: 0.18,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const blackEyeMat = new THREE.MeshStandardMaterial({
    color: 0x3dff9e,
    emissive: 0x10e87b,
    emissiveIntensity: 1.85,
    roughness: 0.08,
  });

  const blackGemMat = new THREE.MeshStandardMaterial({
    color: 0x2bff95,
    emissive: 0x0ec76a,
    emissiveIntensity: 1.35,
    roughness: 0.12,
    metalness: 0.2,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xbfb3a6,
    bumpMap: textures.skinBumpMap,
    bumpScale: 0.014,
    roughness: 0.5,
    metalness: 0.04,
  });

  const eyeSocketMat = new THREE.MeshStandardMaterial({
    color: 0x0c0709,
    roughness: 0.92,
    metalness: 0.0,
  });

  const candleWaxMat = new THREE.MeshStandardMaterial({
    color: 0xc9b8ab,
    roughness: 0.65,
    metalness: 0.02,
  });

  // Bright vivid red candle flame + inner core + glowing conical red aura
  const candleFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff221c,
  });

  const candleFlameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xff6b42,
  });

  const candleHaloMat = new THREE.MeshBasicMaterial({
    color: 0xe00718,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Gore & capture cinematic materials
  const bloodMat = new THREE.MeshPhysicalMaterial({
    color: 0x80000b,
    emissive: 0x240003,
    roughness: 0.12,
    metalness: 0.08,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06,
  });

  const bloodPoolMat = new THREE.MeshStandardMaterial({
    color: 0x5c0008,
    emissive: 0x1a0002,
    roughness: 0.12,
    metalness: 0.06,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const goreChunkMat = new THREE.MeshStandardMaterial({
    color: 0x450308,
    roughness: 0.58,
    metalness: 0.04,
  });

  const fireOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const fireInnerMat = new THREE.MeshBasicMaterial({
    color: 0xffaa22,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const purpleOrbMat = new THREE.MeshBasicMaterial({
    color: 0xc75cff,
  });

  const purpleOrbAuraMat = new THREE.MeshBasicMaterial({
    color: 0x7b1fa2,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const blueOrbMat = new THREE.MeshBasicMaterial({
    color: 0x4cb8ff,
  });

  const blueOrbAuraMat = new THREE.MeshBasicMaterial({
    color: 0x0a58ca,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const ironSpikeMat = new THREE.MeshStandardMaterial({
    color: 0x1f191d,
    roughness: 0.34,
    metalness: 0.84,
  });

  const mawInnerMat = new THREE.MeshStandardMaterial({
    color: 0xb0000e,
    emissive: 0x6b0007,
    emissiveIntensity: 0.88,
    roughness: 0.26,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const selectHighlightMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const legalMoveMat = new THREE.MeshBasicMaterial({
    color: 0xf7e396,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  const captureMoveMat = new THREE.MeshBasicMaterial({
    color: 0xff1e38,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  const checkHighlightMat = new THREE.MeshBasicMaterial({
    color: 0xff0d29,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });

  const lastMoveMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  const allMaterials: THREE.Material[] = [
    redSquareMat,
    greenSquareMat,
    frameObsidianMat,
    frameRubyTrimMat,
    tableCryptMat,
    redArmorMat,
    redFleshMat,
    redCapeMat,
    redStoneMat,
    redTrimMat,
    redHornMat,
    redPhantomMat,
    redEyeMat,
    redGemMat,
    blackArmorMat,
    blackFleshMat,
    blackCapeMat,
    blackStoneMat,
    blackTrimMat,
    blackHornMat,
    blackPhantomMat,
    blackEyeMat,
    blackGemMat,
    boneMat,
    eyeSocketMat,
    candleWaxMat,
    candleFlameMat,
    candleFlameCoreMat,
    candleHaloMat,
    bloodMat,
    bloodPoolMat,
    goreChunkMat,
    fireOuterMat,
    fireInnerMat,
    purpleOrbMat,
    purpleOrbAuraMat,
    blueOrbMat,
    blueOrbAuraMat,
    ironSpikeMat,
    mawInnerMat,
    selectHighlightMat,
    legalMoveMat,
    captureMoveMat,
    checkHighlightMat,
    lastMoveMat,
  ];

  return {
    redSquareMat,
    greenSquareMat,
    frameObsidianMat,
    frameRubyTrimMat,
    tableCryptMat,
    redArmorMat,
    redFleshMat,
    redCapeMat,
    redStoneMat,
    redTrimMat,
    redHornMat,
    redPhantomMat,
    redEyeMat,
    redGemMat,
    blackArmorMat,
    blackFleshMat,
    blackCapeMat,
    blackStoneMat,
    blackTrimMat,
    blackHornMat,
    blackPhantomMat,
    blackEyeMat,
    blackGemMat,
    boneMat,
    eyeSocketMat,
    candleWaxMat,
    candleFlameMat,
    candleFlameCoreMat,
    candleHaloMat,
    bloodMat,
    bloodPoolMat,
    goreChunkMat,
    fireOuterMat,
    fireInnerMat,
    purpleOrbMat,
    purpleOrbAuraMat,
    blueOrbMat,
    blueOrbAuraMat,
    ironSpikeMat,
    mawInnerMat,
    selectHighlightMat,
    legalMoveMat,
    captureMoveMat,
    checkHighlightMat,
    lastMoveMat,
    dispose: () => {
      allMaterials.forEach((m) => m.dispose());
    },
  };
}
