import * as THREE from 'three';

function createVeinedMarbleCanvas(
  baseHex: string,
  veinHex: string,
  highlightHex: string,
  seed: number,
): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  for (let i = 0; i < 24; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 24 + rand() * 76;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, i % 2 === 0 ? highlightHex : veinHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark veins & ancient jagged fissures
  ctx.globalAlpha = 0.52;
  ctx.strokeStyle = veinHex;
  for (let v = 0; v < 12; v++) {
    ctx.lineWidth = 0.9 + rand() * 2.2;
    ctx.beginPath();
    let vx = rand() * size;
    let vy = 0;
    ctx.moveTo(vx, vy);
    for (let step = 0; step < 10; step++) {
      vx += (rand() - 0.5) * 56;
      vy += size / 10;
      ctx.lineTo(vx, vy);
    }
    ctx.stroke();
  }

  // Sinister dark obsidian crack lines
  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = '#070204';
  for (let c = 0; c < 4; c++) {
    ctx.lineWidth = 0.8 + rand() * 1.1;
    ctx.beginPath();
    let cx = rand() * size;
    let cy = rand() * size * 0.3;
    ctx.moveTo(cx, cy);
    for (let step = 0; step < 6; step++) {
      cx += (rand() - 0.5) * 48;
      cy += 28 + rand() * 24;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Dark haunted border vignette on every tile
  ctx.globalAlpha = 1;
  const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,2,4,0.62)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#090305';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  return canvas;
}

function createMicroDetailBumpCanvas(seed: number, contrast: number, streaks = false): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const val = 128 + Math.floor(((s / 4294967296) - 0.5) * contrast);
    img.data[i] = val;
    img.data[i + 1] = val;
    img.data[i + 2] = val;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  if (streaks) {
    ctx.strokeStyle = 'rgba(40,40,40,0.28)';
    for (let y = 0; y < size; y += 18) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let y = 0; y < size; y += 18) {
      const offset = (y / 18) % 2 === 0 ? 0 : 20;
      for (let x = offset; x < size; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 18);
        ctx.stroke();
      }
    }
  }

  return canvas;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCoordinateLabelTexture(text: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#e62236';
  ctx.font = 'bold 34px "Cinzel Decorative", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFleshColorCanvas(baseHex: string, veinHex: string, bruiseHex: string, seed: number): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  // Mottled necrotic/pale subcutaneous shading
  for (let i = 0; i < 32; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 14 + rand() * 44;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, bruiseHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine branching dark capillaries & scars
  ctx.strokeStyle = veinHex;
  for (let v = 0; v < 18; v++) {
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    let vx = rand() * size;
    let vy = rand() * size;
    ctx.moveTo(vx, vy);
    for (let k = 0; k < 5; k++) {
      vx += (rand() - 0.5) * 36;
      vy += (rand() - 0.5) * 36;
      ctx.lineTo(vx, vy);
    }
    ctx.stroke();
  }

  return canvas;
}

function createCastleMasonryColorCanvas(baseHex: string, mortarHex: string, accentHex: string, seed: number): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const rowH = 22;
  const colW = 42;
  for (let row = 0; row * rowH < size; row++) {
    const y = row * rowH;
    const offset = row % 2 === 0 ? 0 : colW / 2;
    for (let x = -colW; x < size + colW; x += colW) {
      ctx.globalAlpha = 0.16 + rand() * 0.22;
      ctx.fillStyle = rand() > 0.5 ? accentHex : mortarHex;
      ctx.fillRect(x + offset + 2, y + 2, colW - 4, rowH - 4);
    }
  }

  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = mortarHex;
  ctx.lineWidth = 2;
  for (let y = 0; y < size; y += rowH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    const offset = Math.round(y / rowH) % 2 === 0 ? 0 : colW / 2;
    for (let x = offset; x < size; x += colW) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }
  }

  return canvas;
}

function createArmorGrainCanvas(baseHex: string, scratchHex: string, seed: number): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  ctx.strokeStyle = scratchHex;
  for (let i = 0; i < 65; i++) {
    ctx.globalAlpha = 0.15 + rand() * 0.2;
    ctx.lineWidth = 0.6 + rand() * 1.1;
    const x1 = rand() * size;
    const y1 = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (rand() - 0.5) * 44, y1 + (rand() - 0.5) * 20);
    ctx.stroke();
  }
  return canvas;
}

export interface BoardTextures {
  redSquareMap: THREE.CanvasTexture;
  greenSquareMap: THREE.CanvasTexture;
  stoneBumpMap: THREE.CanvasTexture;
  masonryBumpMap: THREE.CanvasTexture;
  skinBumpMap: THREE.CanvasTexture;
  redFleshMap: THREE.CanvasTexture;
  blackFleshMap: THREE.CanvasTexture;
  redStoneMap: THREE.CanvasTexture;
  blackStoneMap: THREE.CanvasTexture;
  redArmorMap: THREE.CanvasTexture;
  blackArmorMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createBoardTextures(maxAnisotropy: number): BoardTextures {
  // Tenebrous Vivid Red ("rojo vivo tenebroso") blood-veined marble
  const redCanvas = createVeinedMarbleCanvas('#b80619', '#2b0005', '#e6192e', 101);
  const redSquareMap = new THREE.CanvasTexture(redCanvas);
  redSquareMap.colorSpace = THREE.SRGBColorSpace;
  redSquareMap.anisotropy = maxAnisotropy;

  // Tenebrous Emerald Green ("verde tenebroso") cursed malachite marble
  const greenCanvas = createVeinedMarbleCanvas('#0a6630', '#021f0e', '#199e50', 303);
  const greenSquareMap = new THREE.CanvasTexture(greenCanvas);
  greenSquareMap.colorSpace = THREE.SRGBColorSpace;
  greenSquareMap.anisotropy = maxAnisotropy;

  const stoneBumpMap = new THREE.CanvasTexture(createMicroDetailBumpCanvas(4242, 40, false));
  stoneBumpMap.wrapS = THREE.RepeatWrapping;
  stoneBumpMap.wrapT = THREE.RepeatWrapping;
  stoneBumpMap.anisotropy = maxAnisotropy;

  const masonryBumpMap = new THREE.CanvasTexture(createMicroDetailBumpCanvas(5151, 58, true));
  masonryBumpMap.wrapS = THREE.RepeatWrapping;
  masonryBumpMap.wrapT = THREE.RepeatWrapping;
  masonryBumpMap.repeat.set(2, 2);
  masonryBumpMap.anisotropy = maxAnisotropy;

  const skinBumpMap = new THREE.CanvasTexture(createMicroDetailBumpCanvas(6262, 42, false));
  skinBumpMap.wrapS = THREE.RepeatWrapping;
  skinBumpMap.wrapT = THREE.RepeatWrapping;
  skinBumpMap.anisotropy = maxAnisotropy;

  const redFleshMap = new THREE.CanvasTexture(createFleshColorCanvas('#945b56', '#2e050b', '#592026', 7171));
  redFleshMap.colorSpace = THREE.SRGBColorSpace;
  redFleshMap.anisotropy = maxAnisotropy;

  const blackFleshMap = new THREE.CanvasTexture(createFleshColorCanvas('#4b5750', '#111a14', '#27332c', 8282));
  blackFleshMap.colorSpace = THREE.SRGBColorSpace;
  blackFleshMap.anisotropy = maxAnisotropy;

  const redStoneMap = new THREE.CanvasTexture(createCastleMasonryColorCanvas('#470b12', '#170204', '#69141e', 9191));
  redStoneMap.colorSpace = THREE.SRGBColorSpace;
  redStoneMap.wrapS = THREE.RepeatWrapping;
  redStoneMap.wrapT = THREE.RepeatWrapping;
  redStoneMap.repeat.set(2, 2);
  redStoneMap.anisotropy = maxAnisotropy;

  const blackStoneMap = new THREE.CanvasTexture(createCastleMasonryColorCanvas('#181b21', '#050608', '#293038', 9393));
  blackStoneMap.colorSpace = THREE.SRGBColorSpace;
  blackStoneMap.wrapS = THREE.RepeatWrapping;
  blackStoneMap.wrapT = THREE.RepeatWrapping;
  blackStoneMap.repeat.set(2, 2);
  blackStoneMap.anisotropy = maxAnisotropy;

  const redArmorMap = new THREE.CanvasTexture(createArmorGrainCanvas('#780513', '#ba2b3c', 5511));
  redArmorMap.colorSpace = THREE.SRGBColorSpace;
  redArmorMap.anisotropy = maxAnisotropy;

  const blackArmorMap = new THREE.CanvasTexture(createArmorGrainCanvas('#111419', '#35404d', 6622));
  blackArmorMap.colorSpace = THREE.SRGBColorSpace;
  blackArmorMap.anisotropy = maxAnisotropy;

  const contactShadowMap = createContactShadowTexture();

  return {
    redSquareMap,
    greenSquareMap,
    stoneBumpMap,
    masonryBumpMap,
    skinBumpMap,
    redFleshMap,
    blackFleshMap,
    redStoneMap,
    blackStoneMap,
    redArmorMap,
    blackArmorMap,
    contactShadowMap,
    dispose: () => {
      redSquareMap.dispose();
      greenSquareMap.dispose();
      stoneBumpMap.dispose();
      masonryBumpMap.dispose();
      skinBumpMap.dispose();
      redFleshMap.dispose();
      blackFleshMap.dispose();
      redStoneMap.dispose();
      blackStoneMap.dispose();
      redArmorMap.dispose();
      blackArmorMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
