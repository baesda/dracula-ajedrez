import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { draculaAudio } from '../audio/draculaAudio';
import { squareToWorld } from '../chess/engine';
import type {
  ChessPieceInfo,
  GameSnapshot,
  LegalMoveTarget,
  PieceType,
  TeamColor,
} from '../chess/types';
import {
  CAPTURE_ANIM_DURATION,
  canPieceJump,
  computeCandleFlicker,
  computeMoveHeight,
  getQueenMagicOrbPalette,
} from './animationConfig';
import { computeLightingFromBrightness, DEFAULT_BRIGHTNESS } from './brightness';
import { createDraculaMaterials, type DraculaMaterials } from './materials';
import {
  buildDraculaPieceMesh,
  createPieceGeometryCache,
  type PieceGeometryCache,
  type PieceRig,
} from './pieceFactory';
import { createBoardTextures, createCoordinateLabelTexture, type BoardTextures } from './textures';

const TILE_SIZE = 1.0;
const BOARD_TOP_Y = 0.0;
const BLOOD_PARTICLE_COUNT = 120;
const SPARK_PARTICLE_COUNT = 90;

interface ActivePieceAnim {
  group: THREE.Group;
  type: PieceType;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startFacingY: number;
  moveFacingY: number;
  defaultFacingY: number;
  progress: number;
  duration: number;
  bouncePhase: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  gravity: number;
}

interface CandleRig {
  outerFlame: THREE.Mesh;
  innerFlame: THREE.Mesh;
  halo: THREE.Mesh;
  light: THREE.PointLight;
}

interface CaptureSequence {
  attackerType: PieceType;
  attackerColor: TeamColor;
  attackerGroup: THREE.Group;
  victimGroup: THREE.Group;
  startX: number;
  startZ: number;
  victimX: number;
  victimZ: number;
  attackAngleY: number;
  elapsed: number;
  duration: number;
  bloodPool: THREE.Mesh;
  fireCones: THREE.Mesh[];
  magicOrb: THREE.Group | null;
  ironSpikes: THREE.Mesh[];
  stageFlags: Set<string>;
}

const _dummy = new THREE.Object3D();
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _color = new THREE.Color();

function shortestAngleLerp(current: number, target: number, alpha: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * alpha;
}

function isSoftwareRendererContext(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createSafeWebGLRenderer(): THREE.WebGLRenderer {
  const attempts: THREE.WebGLRendererParameters[] = [
    { antialias: true, powerPreference: 'high-performance' },
    { antialias: false, powerPreference: 'default' },
    { antialias: false, failIfMajorPerformanceCaveat: false },
  ];
  let lastErr: unknown;
  for (const opts of attempts) {
    try {
      return new THREE.WebGLRenderer(opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo inicializar WebGL.');
}

export interface DraculaSceneCallbacks {
  onSquareClick: (square: string) => void;
  onCaptureStateChange?: (capturing: boolean) => void;
  onContextLost?: () => void;
}

export class DraculaChessScene {
  private container: HTMLElement;
  private callbacks: DraculaSceneCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private textures: BoardTextures;
  private materials: DraculaMaterials;
  private pieceGeos: PieceGeometryCache;

  private squareMeshes = new Map<string, THREE.Mesh>();
  private raycastTargets: THREE.Object3D[] = [];
  private highlightGroup = new THREE.Group();
  private piecesGroup = new THREE.Group();
  private captureFxGroup = new THREE.Group();

  // Keyed by current square -> { type, color, group }
  private pieceEntries = new Map<
    string,
    { type: PieceType; color: TeamColor; group: THREE.Group }
  >();
  private activeAnims: ActivePieceAnim[] = [];
  private captureSeq: CaptureSequence | null = null;

  // Pre-allocated Instanced VFX Pools (blood droplets + magic/fire/bone sparks)
  private bloodMesh: THREE.InstancedMesh;
  private bloodParticles: ParticleSlot[] = [];
  private sparkMesh: THREE.InstancedMesh;
  private sparkMat: THREE.MeshBasicMaterial;
  private sparkParticles: ParticleSlot[] = [];

  // Shared geometries for capture props (created once, disposed cleanly)
  private bloodPoolGeo: THREE.CircleGeometry;
  private fireConeGeo: THREE.ConeGeometry;
  private orbCoreGeo: THREE.SphereGeometry;
  private orbAuraGeo: THREE.SphereGeometry;
  private spikeGeo: THREE.ConeGeometry;

  // Taller red asynchronous candle rigs
  private candleRigs: CandleRig[] = [];
  private hemiLight: THREE.HemisphereLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private eerieSideLight: THREE.DirectionalLight | null = null;
  private currentBrightness = DEFAULT_BRIGHTNESS;

  // Camera transition & subtle impact trauma shake
  private titleOrbitMode = true;
  private titleOrbitAngle = 0.55;
  private trauma = 0;
  private lastShakeOffset = new THREE.Vector3();
  private camTransition: {
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  } = {
    active: false,
    targetPos: new THREE.Vector3(0, 8.2, 8.8),
    targetLook: new THREE.Vector3(0, 0.25, 0),
  };

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private disposed = false;
  private frameId = 0;
  private lastTime = performance.now();
  private elapsedTime = 0;
  private resizeObserver: ResizeObserver;

  private extraDisposables: { dispose: () => void }[] = [];

  constructor(container: HTMLElement, callbacks: DraculaSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    this.renderer = createSafeWebGLRenderer();
    this.isSoftwareGl = isSoftwareRendererContext(this.renderer.getContext());

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.dataset.testid = 'chess-canvas';

    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    this.extraDisposables.push({
      dispose: () => this.renderer.domElement.removeEventListener('webglcontextlost', onContextLost),
    });

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040204);
    this.scene.fog = new THREE.FogExp2(0x040204, 0.068);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(6.5, 7.6, 8.2);

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const roomEnv = new RoomEnvironment();
      const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.36;
      this.extraDisposables.push(envTex);
      roomEnv.dispose();
      pmrem.dispose();
    } catch {
      // Skip PMREM environment map on constrained WebGL drivers
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.zoomSpeed = 1.15;
    this.controls.rotateSpeed = 0.85;
    this.controls.minDistance = 6.0;
    this.controls.maxDistance = 19.5;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    this.controls.addEventListener('start', () => {
      this.camTransition.active = false;
    });

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createBoardTextures(maxAniso);
    this.materials = createDraculaMaterials(this.textures);
    this.pieceGeos = createPieceGeometryCache();

    // Shared capture prop geometries
    this.bloodPoolGeo = new THREE.CircleGeometry(0.46, 24);
    this.fireConeGeo = new THREE.ConeGeometry(0.18, 0.82, 8);
    this.orbCoreGeo = new THREE.SphereGeometry(0.13, 18, 14);
    this.orbAuraGeo = new THREE.SphereGeometry(0.21, 16, 12);
    this.spikeGeo = new THREE.ConeGeometry(0.085, 0.95, 6);
    this.extraDisposables.push(
      this.bloodPoolGeo,
      this.fireConeGeo,
      this.orbCoreGeo,
      this.orbAuraGeo,
      this.spikeGeo,
    );

    this.setupLighting();
    this.buildGothicEnvironment();
    this.buildBoard();
    this.scene.add(this.highlightGroup);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.captureFxGroup);

    // Pooled Blood Droplets InstancedMesh
    const bloodGeo = new THREE.SphereGeometry(0.052, 7, 6);
    this.extraDisposables.push(bloodGeo);
    this.bloodMesh = new THREE.InstancedMesh(bloodGeo, this.materials.bloodMat, BLOOD_PARTICLE_COUNT);
    this.bloodMesh.frustumCulled = false;
    for (let i = 0; i < BLOOD_PARTICLE_COUNT; i++) {
      this.bloodParticles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        gravity: 9.5,
      });
      _dummy.position.set(0, -10, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.bloodMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.bloodMesh);

    // Pooled Fire/Magic/Bone Sparks InstancedMesh (neutral white material for per-instance colors)
    const sparkGeo = new THREE.OctahedronGeometry(0.068, 0);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.extraDisposables.push(sparkGeo, this.sparkMat);
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, this.sparkMat, SPARK_PARTICLE_COUNT);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < SPARK_PARTICLE_COUNT; i++) {
      this.sparkParticles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        gravity: 3.5,
      });
      _dummy.position.set(0, -10, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
      _color.setHex(0xff4411);
      this.sparkMesh.setColorAt(i, _color);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.sparkMesh);

    if (!this.isSoftwareGl) {
      try {
        this.renderer.compile(this.scene, this.camera);
      } catch {
        // Non-fatal: shader compilation will proceed lazily on first render
      }
    }

    this.bindInputEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.startLoop();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0x424e7a, 0x1e0307, 0.34);
    this.hemiLight = hemi;
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xd9e3ff, 1.08);
    keyLight.position.set(-4.5, 10.5, 7.5);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 30;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.keyLight = keyLight;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xe60c28, 1.55);
    rimLight.position.set(-7, 4.5, -8);
    this.rimLight = rimLight;
    this.scene.add(rimLight);

    const eerieSideLight = new THREE.DirectionalLight(0x0c8f4a, 0.85);
    eerieSideLight.position.set(8, 3.5, -6);
    this.eerieSideLight = eerieSideLight;
    this.scene.add(eerieSideLight);

    this.setBrightness(this.currentBrightness);
  }

  setBrightness(value: number): void {
    const { exposure, environmentIntensity, lightMultiplier } = computeLightingFromBrightness(value);
    this.currentBrightness = value;
    this.renderer.toneMappingExposure = exposure;
    this.scene.environmentIntensity = environmentIntensity;
    if (this.hemiLight) this.hemiLight.intensity = 0.34 * lightMultiplier;
    if (this.keyLight) this.keyLight.intensity = 1.08 * lightMultiplier;
    if (this.rimLight) this.rimLight.intensity = 1.55 * lightMultiplier;
    if (this.eerieSideLight) this.eerieSideLight.intensity = 0.85 * lightMultiplier;
    this.requestRender();
  }

  private buildGothicEnvironment(): void {
    const tableGeo = new THREE.CylinderGeometry(24, 25, 1.2, 40);
    const table = new THREE.Mesh(tableGeo, this.materials.tableCryptMat);
    table.position.y = -0.82;
    table.receiveShadow = true;
    this.scene.add(table);
    this.extraDisposables.push(tableGeo);

    // Taller gothic iron candelabra + tall wax candles + bright red multi-layer flames
    const holderGeo = new THREE.CylinderGeometry(0.2, 0.36, 0.56, 8);
    const candleGeo = new THREE.CylinderGeometry(0.095, 0.12, 1.38, 12);
    const waxCollarGeo = new THREE.TorusGeometry(0.095, 0.026, 8, 14);
    const outerFlameGeo = new THREE.ConeGeometry(0.115, 0.44, 10);
    const innerFlameGeo = new THREE.ConeGeometry(0.058, 0.26, 8);
    const haloGeo = new THREE.ConeGeometry(0.175, 0.62, 10);
    const obeliskGeo = new THREE.ConeGeometry(0.2, 0.95, 4);
    const crystalGeo = new THREE.OctahedronGeometry(0.1, 0);
    this.extraDisposables.push(
      holderGeo,
      candleGeo,
      waxCollarGeo,
      outerFlameGeo,
      innerFlameGeo,
      haloGeo,
      obeliskGeo,
      crystalGeo,
    );

    const offsets: [number, number][] = [
      [-4.95, -4.95],
      [4.95, -4.95],
      [-4.95, 4.95],
      [4.95, 4.95],
    ];

    offsets.forEach(([x, z], idx) => {
      const holder = new THREE.Mesh(holderGeo, this.materials.frameObsidianMat);
      holder.position.set(x, 0.02, z);
      holder.castShadow = true;
      this.scene.add(holder);

      const wax = new THREE.Mesh(candleGeo, this.materials.candleWaxMat);
      wax.position.set(x, 0.98, z);
      wax.castShadow = true;
      this.scene.add(wax);

      const collar = new THREE.Mesh(waxCollarGeo, this.materials.candleWaxMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(x, 1.66, z);
      this.scene.add(collar);

      // Vivid bright RED flickering candle flame + inner core + conical flame aura
      const outerFlame = new THREE.Mesh(outerFlameGeo, this.materials.candleFlameMat);
      outerFlame.position.set(x, 1.89, z);
      this.scene.add(outerFlame);

      const innerFlame = new THREE.Mesh(innerFlameGeo, this.materials.candleFlameCoreMat);
      innerFlame.position.set(x, 1.82, z);
      this.scene.add(innerFlame);

      const halo = new THREE.Mesh(haloGeo, this.materials.candleHaloMat);
      halo.position.set(x, 1.94, z);
      this.scene.add(halo);

      // Strong vivid RED PointLight illuminating board & pieces asynchronously
      const pLight = new THREE.PointLight(0xff1822, 3.85, 16.5, 1.35);
      pLight.position.set(x * 0.84, 2.15, z * 0.84);
      this.scene.add(pLight);

      this.candleRigs.push({
        outerFlame,
        innerFlame,
        halo,
        light: pLight,
      });

      // Corner obsidian spire flanking the tall candelabra
      const sx = x * 0.89;
      const sz = z * 0.89;
      const spire = new THREE.Mesh(obeliskGeo, this.materials.frameObsidianMat);
      spire.position.set(sx, 0.28, sz);
      spire.rotation.y = Math.PI / 4;
      this.scene.add(spire);

      const crystal = new THREE.Mesh(
        crystalGeo,
        idx % 2 === 0 ? this.materials.redGemMat : this.materials.blackGemMat,
      );
      crystal.position.set(sx, 0.84, sz);
      crystal.scale.set(0.8, 1.35, 0.8);
      this.scene.add(crystal);
    });
  }

  private buildBoard(): void {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const frameGeo = new THREE.BoxGeometry(8.92, 0.36, 8.92);
    const frame = new THREE.Mesh(frameGeo, this.materials.frameObsidianMat);
    frame.position.y = -0.2;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.scene.add(frame);

    const trimGeo = new THREE.BoxGeometry(8.24, 0.38, 8.24);
    const trim = new THREE.Mesh(trimGeo, this.materials.frameRubyTrimMat);
    trim.position.y = -0.195;
    this.scene.add(trim);
    this.extraDisposables.push(frameGeo, trimGeo);

    const tileGeo = new THREE.BoxGeometry(TILE_SIZE * 0.992, 0.12, TILE_SIZE * 0.992);
    this.extraDisposables.push(tileGeo);

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = `${files[file]}${rank + 1}`;
        const isRedSquare = (file + rank) % 2 === 1;
        const mat = isRedSquare ? this.materials.redSquareMat : this.materials.greenSquareMat;
        const mesh = new THREE.Mesh(tileGeo, mat);
        const { x, z } = squareToWorld(square, TILE_SIZE);
        mesh.position.set(x, -0.06, z);
        mesh.receiveShadow = true;
        mesh.userData.square = square;
        this.scene.add(mesh);
        this.squareMeshes.set(square, mesh);
        this.raycastTargets.push(mesh);
      }
    }

    const labelGeo = new THREE.PlaneGeometry(0.28, 0.28);
    this.extraDisposables.push(labelGeo);
    files.forEach((f, idx) => {
      const tex = createCoordinateLabelTexture(f.toUpperCase());
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8 });
      this.extraDisposables.push(tex, mat);
      const label = new THREE.Mesh(labelGeo, mat);
      label.rotation.x = -Math.PI / 2;
      label.position.set((idx - 3.5) * TILE_SIZE, -0.004, 4.26);
      this.scene.add(label);
    });
    for (let r = 0; r < 8; r++) {
      const tex = createCoordinateLabelTexture(String(r + 1));
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8 });
      this.extraDisposables.push(tex, mat);
      const label = new THREE.Mesh(labelGeo, mat);
      label.rotation.x = -Math.PI / 2;
      label.position.set(-4.26, -0.004, (3.5 - r) * TILE_SIZE);
      this.scene.add(label);
    }
  }

  private bindInputEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos.x = e.clientX;
      this.pointerDownPos.y = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.titleOrbitMode || this.captureSeq) return;
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return;

      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const pieceHits = this.raycaster.intersectObjects(this.piecesGroup.children, true);
      for (const hit of pieceHits) {
        if (hit.object.userData.isContactShadow) continue;
        const sq = hit.object.userData.square as string | undefined;
        if (sq) {
          this.callbacks.onSquareClick(sq);
          return;
        }
      }
      const hits = this.raycaster.intersectObjects(this.raycastTargets, false);
      if (hits.length > 0) {
        const sq = hits[0].object.userData.square as string | undefined;
        if (sq) {
          this.callbacks.onSquareClick(sq);
        }
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);

    this.extraDisposables.push({
      dispose: () => {
        dom.removeEventListener('pointerdown', onPointerDown);
        dom.removeEventListener('pointerup', onPointerUp);
      },
    });
  }

  setTitleMode(active: boolean, playerColor: TeamColor = 'w', instant = false): void {
    this.titleOrbitMode = active;
    if (!active) {
      this.focusCameraForTeam(playerColor, instant || this.isSoftwareGl);
    }
    this.requestRender();
  }

  focusCameraForTeam(team: TeamColor, instant = false): void {
    const zSign = team === 'w' ? 1 : -1;
    this.camTransition.targetPos.set(0, 8.4, 8.8 * zSign);
    this.camTransition.targetLook.set(0, 0.25, 0);
    if (instant) {
      this.camera.position.copy(this.camTransition.targetPos);
      this.controls.target.copy(this.camTransition.targetLook);
      this.controls.update();
      this.camTransition.active = false;
    } else {
      this.camTransition.active = true;
    }
    this.requestRender();
  }

  zoomBy(factor: number): void {
    _v3.copy(this.camera.position).sub(this.controls.target);
    const nextLen = THREE.MathUtils.clamp(
      _v3.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    _v3.normalize().multiplyScalar(nextLen);
    this.camera.position.copy(this.controls.target).add(_v3);
    this.controls.update();
    this.requestRender();
  }

  isCaptureAnimating(): boolean {
    return this.captureSeq !== null;
  }

  cancelCaptureAnimation(): void {
    if (!this.captureSeq) return;
    const seq = this.captureSeq;
    this.resetPieceRig(seq.attackerGroup);
    seq.attackerGroup.position.set(
      squareToWorld(this.findSquareForGroup(seq.attackerGroup) ?? 'e1', TILE_SIZE).x,
      BOARD_TOP_Y,
      squareToWorld(this.findSquareForGroup(seq.attackerGroup) ?? 'e1', TILE_SIZE).z,
    );
    seq.attackerGroup.scale.set(1, 1, 1);
    this.clearCaptureFxGroup();
    this.captureSeq = null;
    this.callbacks.onCaptureStateChange?.(false);
    this.requestRender();
  }

  private findSquareForGroup(group: THREE.Group): string | null {
    for (const [sq, entry] of this.pieceEntries.entries()) {
      if (entry.group === group) return sq;
    }
    return null;
  }

  private clearCaptureFxGroup(): void {
    while (this.captureFxGroup.children.length > 0) {
      this.captureFxGroup.remove(this.captureFxGroup.children[0]);
    }
  }

  private resetPieceRig(group: THREE.Group): void {
    const rig = group.userData.rig as PieceRig | undefined;
    if (!rig) return;
    rig.visualGroup.rotation.set(0, rig.defaultFacingY, 0);
    rig.visualGroup.position.set(0, 0, 0);
    rig.visualGroup.scale.set(1, 1, 1);

    if (rig.pawnUpperHeadPivot) {
      rig.pawnUpperHeadPivot.rotation.set(0, 0, 0);
      rig.pawnUpperHeadPivot.scale.set(1, 1, 1);
    }
    if (rig.pawnLowerJawPivot) {
      rig.pawnLowerJawPivot.rotation.set(0, 0, 0);
      rig.pawnLowerJawPivot.scale.set(1, 1, 1);
    }
    if (rig.pawnMawMesh) {
      rig.pawnMawMesh.scale.setScalar(0.001);
    }
    if (rig.pawnLeftArmPivot) {
      rig.pawnLeftArmPivot.rotation.set(0, 0, 0);
      rig.pawnLeftArmPivot.scale.set(1, 1, 1);
    }
    if (rig.pawnRightArmPivot) {
      rig.pawnRightArmPivot.rotation.set(0, 0, 0);
      rig.pawnRightArmPivot.scale.set(1, 1, 1);
    }
    if (rig.bishopStaffPivot) {
      rig.bishopStaffPivot.position.set(0.24, 0.72, 0.06);
      rig.bishopStaffPivot.rotation.set(0, 0, 0);
    }
    if (rig.queenLeftArmPivot) {
      rig.queenLeftArmPivot.rotation.set(0, 0, 0);
      rig.queenLeftArmPivot.scale.setScalar(0.001);
    }
    if (rig.queenRightArmPivot) {
      rig.queenRightArmPivot.rotation.set(0, 0, 0);
      rig.queenRightArmPivot.scale.setScalar(0.001);
    }
    if (rig.queenScepterPivot) {
      rig.queenScepterPivot.rotation.set(0, 0, 0);
    }
    if (rig.kingHeadPivot) {
      rig.kingHeadPivot.rotation.set(0, 0, 0);
    }
    if (rig.kingJawPivot) {
      rig.kingJawPivot.rotation.set(0, 0, 0);
    }
    if (rig.knightNeckPivot) {
      rig.knightNeckPivot.rotation.set(0, 0, 0);
    }
    if (rig.rookBodyPivot) {
      rig.rookBodyPivot.position.set(0, 0, 0);
      rig.rookBodyPivot.rotation.set(0, 0, 0);
    }
  }

  private spawnBloodBurst(
    worldX: number,
    worldY: number,
    worldZ: number,
    count: number,
    speedMin = 1.1,
    speedMax = 3.2,
    vyMin = 1.6,
    vyMax = 4.2,
    scaleBase = 0.85,
    biasVx = 0,
    biasVz = 0,
  ): void {
    let spawned = 0;
    for (let i = 0; i < BLOOD_PARTICLE_COUNT && spawned < count; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        p.active = true;
        p.x = worldX + (Math.random() - 0.5) * 0.14;
        p.y = worldY + (Math.random() - 0.5) * 0.12;
        p.z = worldZ + (Math.random() - 0.5) * 0.14;
        p.vx = Math.cos(angle) * speed + biasVx;
        p.vy = vyMin + Math.random() * (vyMax - vyMin);
        p.vz = Math.sin(angle) * speed + biasVz;
        p.life = 0;
        p.maxLife = 0.75 + Math.random() * 0.65;
        p.scale = scaleBase * (0.65 + Math.random() * 0.85);
        p.gravity = 9.8;
        spawned++;
      }
    }
  }

  private spawnBloodStream(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    count: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < BLOOD_PARTICLE_COUNT && spawned < count; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) {
        p.active = true;
        p.x = fromX + (Math.random() - 0.5) * 0.08;
        p.y = fromY + (Math.random() - 0.5) * 0.08;
        p.z = fromZ + (Math.random() - 0.5) * 0.08;
        const flight = 0.36 + Math.random() * 0.18;
        p.vx = (toX - fromX) / flight + (Math.random() - 0.5) * 0.55;
        p.vy = (toY - fromY) / flight + 0.5 * 6.5 * flight;
        p.vz = (toZ - fromZ) / flight + (Math.random() - 0.5) * 0.55;
        p.life = 0;
        p.maxLife = flight + 0.35;
        p.scale = 0.75 + Math.random() * 0.65;
        p.gravity = 6.5;
        spawned++;
      }
    }
  }

  private spawnSparkBurst(
    worldX: number,
    worldY: number,
    worldZ: number,
    count: number,
    hexColor: number,
    upwardBias = 2.6,
    spread = 2.6,
    scaleBase = 1.0,
    gravity = 3.2,
  ): void {
    let spawned = 0;
    let colorUpdated = false;
    _color.setHex(hexColor);
    for (let i = 0; i < SPARK_PARTICLE_COUNT && spawned < count; i++) {
      const p = this.sparkParticles[i];
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * spread;
        p.active = true;
        p.x = worldX + (Math.random() - 0.5) * 0.18;
        p.y = worldY + (Math.random() - 0.5) * 0.18;
        p.z = worldZ + (Math.random() - 0.5) * 0.18;
        p.vx = Math.cos(angle) * speed;
        p.vy = upwardBias * (0.45 + Math.random() * 0.85);
        p.vz = Math.sin(angle) * speed;
        p.life = 0;
        p.maxLife = 0.55 + Math.random() * 0.55;
        p.scale = scaleBase * (0.65 + Math.random() * 0.85);
        p.gravity = gravity;
        this.sparkMesh.setColorAt(i, _color);
        colorUpdated = true;
        spawned++;
      }
    }
    if (colorUpdated && this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  private startCaptureSequence(
    attackerType: PieceType,
    attackerColor: TeamColor,
    attackerGroup: THREE.Group,
    victimGroup: THREE.Group,
    fromSq: string,
    victimSq: string,
    destSq: string,
  ): void {
    this.cancelCaptureAnimation();

    // Clear any in-flight move animation on the attacker so capture sequence owns it cleanly
    this.activeAnims = this.activeAnims.filter((a) => a.group !== attackerGroup);

    const { x: sx, z: sz } = squareToWorld(fromSq, TILE_SIZE);
    const { x: vx, z: vz } = squareToWorld(victimSq, TILE_SIZE);
    const { x: ex, z: ez } = squareToWorld(destSq, TILE_SIZE);

    // Re-parent victim into captureFxGroup so it stays visible during the gore kill
    this.piecesGroup.remove(victimGroup);
    victimGroup.position.set(vx, BOARD_TOP_Y, vz);
    victimGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.userData.square = undefined;
      }
    });
    this.captureFxGroup.add(victimGroup);

    attackerGroup.position.set(sx, BOARD_TOP_Y, sz);
    const attackAngleY = Math.atan2(ex - sx, ez - sz);

    // Expanding crimson blood pool under victim (hidden for bloodless Bishop & hidden until Pawn bites)
    const bloodPool = new THREE.Mesh(this.bloodPoolGeo, this.materials.bloodPoolMat);
    bloodPool.rotation.x = -Math.PI / 2;
    bloodPool.position.set(vx, 0.018, vz);
    bloodPool.scale.setScalar(0.01);
    bloodPool.visible = attackerType !== 'b' && attackerType !== 'p';
    this.captureFxGroup.add(bloodPool);

    const fireCones: THREE.Mesh[] = [];
    if (attackerType === 'b') {
      for (let i = 0; i < 8; i++) {
        const isInner = i % 2 === 1;
        const cone = new THREE.Mesh(
          this.fireConeGeo,
          isInner ? this.materials.fireInnerMat : this.materials.fireOuterMat,
        );
        const angle = (i / 8) * Math.PI * 2;
        const r = isInner ? 0.09 : 0.21;
        cone.position.set(vx + Math.cos(angle) * r, 0.42, vz + Math.sin(angle) * r);
        cone.scale.setScalar(0.001);
        this.captureFxGroup.add(cone);
        fireCones.push(cone);
      }
    }

    let magicOrb: THREE.Group | null = null;
    if (attackerType === 'q') {
      magicOrb = new THREE.Group();
      const isRed = attackerColor === 'w';
      const core = new THREE.Mesh(
        this.orbCoreGeo,
        isRed ? this.materials.purpleOrbMat : this.materials.blueOrbMat,
      );
      const aura = new THREE.Mesh(
        this.orbAuraGeo,
        isRed ? this.materials.purpleOrbAuraMat : this.materials.blueOrbAuraMat,
      );
      magicOrb.add(core, aura);
      magicOrb.scale.setScalar(0.001);
      magicOrb.visible = false;
      this.captureFxGroup.add(magicOrb);
    }

    const ironSpikes: THREE.Mesh[] = [];
    if (attackerType === 'r') {
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(this.spikeGeo, this.materials.ironSpikeMat);
        const angle = (i / 6) * Math.PI * 2;
        const r = 0.14 + (i % 2) * 0.08;
        spike.position.set(vx + Math.cos(angle) * r, 0.25, vz + Math.sin(angle) * r);
        spike.rotation.z = (Math.random() - 0.5) * 0.35;
        spike.rotation.x = (Math.random() - 0.5) * 0.35;
        spike.scale.set(1, 0.001, 1);
        this.captureFxGroup.add(spike);
        ironSpikes.push(spike);
      }
    }

    const duration = CAPTURE_ANIM_DURATION[attackerType];
    this.captureSeq = {
      attackerType,
      attackerColor,
      attackerGroup,
      victimGroup,
      startX: sx,
      startZ: sz,
      victimX: ex,
      victimZ: ez,
      attackAngleY,
      elapsed: 0,
      duration,
      bloodPool,
      fireCones,
      magicOrb,
      ironSpikes,
      stageFlags: new Set<string>(),
    };

    draculaAudio.playCaptureGore(attackerType);
    this.callbacks.onCaptureStateChange?.(true);
  }

  syncState(
    pieces: ChessPieceInfo[],
    snapshot: GameSnapshot,
    selectedSquare: string | null,
    legalMoves: LegalMoveTarget[],
  ): void {
    const incomingBySq = new Map<string, ChessPieceInfo>();
    for (const p of pieces) incomingBySq.set(p.square, p);

    const lastMove = snapshot.lastMove;
    const oldMap = this.pieceEntries;
    const nextMap = new Map<string, { type: PieceType; color: TeamColor; group: THREE.Group }>();

    let movedEntry: { type: PieceType; color: TeamColor; group: THREE.Group } | undefined;
    if (lastMove) {
      const candidate = oldMap.get(lastMove.from);
      const destIncoming = incomingBySq.get(lastMove.to);
      if (candidate && destIncoming && candidate.color === destIncoming.color) {
        movedEntry = candidate;
        oldMap.delete(lastMove.from);
      }
    }

    // Check castling rook transfer if any
    let castleRookFrom: string | null = null;
    let castleRookTo: string | null = null;
    if (lastMove?.san.startsWith('O-')) {
      const rank = lastMove.from[1];
      if (lastMove.to[0] === 'g') {
        castleRookFrom = `h${rank}`;
        castleRookTo = `f${rank}`;
      } else if (lastMove.to[0] === 'c') {
        castleRookFrom = `a${rank}`;
        castleRookTo = `d${rank}`;
      }
    }
    let castleRookEntry: { type: PieceType; color: TeamColor; group: THREE.Group } | undefined;
    if (castleRookFrom && castleRookTo) {
      castleRookEntry = oldMap.get(castleRookFrom);
      if (castleRookEntry) oldMap.delete(castleRookFrom);
    }

    // Track captured victim BEFORE deleting oldMap leftovers
    let capturedVictim: { sq: string; entry: { type: PieceType; color: TeamColor; group: THREE.Group } } | null = null;
    if (lastMove && movedEntry) {
      const directVictim = oldMap.get(lastMove.to);
      if (directVictim && directVictim.color !== movedEntry.color) {
        capturedVictim = { sq: lastMove.to, entry: directVictim };
        oldMap.delete(lastMove.to);
      } else {
        // Check en passant captured pawn square (file of `to`, rank of `from`)
        const epSq = `${lastMove.to[0]}${lastMove.from[1]}`;
        const epVictim = oldMap.get(epSq);
        if (epVictim && epVictim.color !== movedEntry.color && movedEntry.type === 'p') {
          capturedVictim = { sq: epSq, entry: epVictim };
          oldMap.delete(epSq);
        }
      }
    }

    for (const [sq, info] of incomingBySq.entries()) {
      const existing = oldMap.get(sq);
      if (existing && existing.type === info.type && existing.color === info.color) {
        nextMap.set(sq, existing);
        oldMap.delete(sq);
      } else if (castleRookTo && sq === castleRookTo && castleRookEntry && castleRookFrom) {
        const { x: sx, z: sz } = squareToWorld(castleRookFrom, TILE_SIZE);
        const { x: ex, z: ez } = squareToWorld(sq, TILE_SIZE);
        nextMap.set(sq, castleRookEntry);
        const rig = castleRookEntry.group.userData.rig as PieceRig;
        this.activeAnims.push({
          group: castleRookEntry.group,
          type: 'r',
          startX: sx,
          startZ: sz,
          endX: ex,
          endZ: ez,
          startFacingY: rig.visualGroup.rotation.y,
          moveFacingY: Math.atan2(ex - sx, ez - sz),
          defaultFacingY: rig.defaultFacingY,
          progress: 0,
          duration: 0.42,
          bouncePhase: 0,
        });
      } else if (lastMove && sq === lastMove.to && movedEntry) {
        const origType = movedEntry.type;
        let finalGroup = movedEntry.group;
        if (movedEntry.type !== info.type) {
          this.piecesGroup.remove(movedEntry.group);
          finalGroup = buildDraculaPieceMesh(
            info.type,
            info.color,
            this.pieceGeos,
            this.materials,
            this.textures.contactShadowMap,
          );
          const { x: sx, z: sz } = squareToWorld(lastMove.from, TILE_SIZE);
          finalGroup.position.set(sx, BOARD_TOP_Y, sz);
          this.piecesGroup.add(finalGroup);
        }

        nextMap.set(sq, { type: info.type, color: info.color, group: finalGroup });

        if (capturedVictim) {
          // Run full 5-10s bloody/gore capture animation!
          this.startCaptureSequence(
            origType === info.type ? info.type : origType,
            info.color,
            finalGroup,
            capturedVictim.entry.group,
            lastMove.from,
            capturedVictim.sq,
            sq,
          );
        } else {
          // Standard move animation: ONLY knight jumps; all others slide grounded
          const { x: sx, z: sz } = squareToWorld(lastMove.from, TILE_SIZE);
          const { x: ex, z: ez } = squareToWorld(sq, TILE_SIZE);
          const rig = finalGroup.userData.rig as PieceRig;
          const isKnight = canPieceJump(info.type);
          if (isKnight) {
            draculaAudio.playKnightLeap();
          }
          this.activeAnims.push({
            group: finalGroup,
            type: info.type,
            startX: sx,
            startZ: sz,
            endX: ex,
            endZ: ez,
            startFacingY: rig.visualGroup.rotation.y,
            moveFacingY: Math.atan2(ex - sx, ez - sz),
            defaultFacingY: rig.defaultFacingY,
            progress: 0,
            duration: isKnight ? 0.62 : 0.36,
            bouncePhase: 0,
          });
        }
      } else {
        const group = buildDraculaPieceMesh(
          info.type,
          info.color,
          this.pieceGeos,
          this.materials,
          this.textures.contactShadowMap,
        );
        const { x, z } = squareToWorld(sq, TILE_SIZE);
        group.position.set(x, BOARD_TOP_Y, z);
        this.piecesGroup.add(group);
        nextMap.set(sq, { type: info.type, color: info.color, group });
      }
    }

    for (const stale of oldMap.values()) {
      this.piecesGroup.remove(stale.group);
    }
    this.pieceEntries = nextMap;

    for (const [sq, entry] of this.pieceEntries.entries()) {
      entry.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !obj.userData.isContactShadow) {
          obj.userData.square = sq;
        }
      });
    }

    // Rebuild board highlights
    while (this.highlightGroup.children.length > 0) {
      const child = this.highlightGroup.children[0] as THREE.Mesh;
      this.highlightGroup.remove(child);
      child.geometry.dispose();
    }

    if (lastMove) {
      [lastMove.from, lastMove.to].forEach((sq) => {
        const { x, z } = squareToWorld(sq, TILE_SIZE);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.36, 0.46, 4),
          this.materials.lastMoveMat,
        );
        ring.rotation.x = -Math.PI / 2;
        ring.rotation.z = Math.PI / 4;
        ring.position.set(x, 0.008, z);
        this.highlightGroup.add(ring);
      });
    }

    if (selectedSquare) {
      const { x, z } = squareToWorld(selectedSquare, TILE_SIZE);
      const selRing = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.47, 28),
        this.materials.selectHighlightMat,
      );
      selRing.rotation.x = -Math.PI / 2;
      selRing.position.set(x, 0.014, z);
      this.highlightGroup.add(selRing);
    }

    for (const move of legalMoves) {
      const { x, z } = squareToWorld(move.to, TILE_SIZE);
      if (move.isCapture) {
        const capRing = new THREE.Mesh(
          new THREE.RingGeometry(0.32, 0.44, 24),
          this.materials.captureMoveMat,
        );
        capRing.rotation.x = -Math.PI / 2;
        capRing.position.set(x, 0.015, z);
        this.highlightGroup.add(capRing);
      } else {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.16, 20),
          this.materials.legalMoveMat,
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, 0.015, z);
        this.highlightGroup.add(dot);
      }
    }

    if (snapshot.inCheck) {
      const checkedKing = pieces.find(
        (p) => p.type === 'k' && p.color === snapshot.turn,
      );
      if (checkedKing) {
        const { x, z } = squareToWorld(checkedKing.square, TILE_SIZE);
        const warnRing = new THREE.Mesh(
          new THREE.RingGeometry(0.32, 0.49, 28),
          this.materials.checkHighlightMat,
        );
        warnRing.rotation.x = -Math.PI / 2;
        warnRing.position.set(x, 0.016, z);
        this.highlightGroup.add(warnRing);
      }
    }

    this.requestRender();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 320);
    const h = Math.max(this.container.clientHeight, 240);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  private updateCaptureSequence(dt: number): void {
    const seq = this.captureSeq;
    if (!seq) return;

    seq.elapsed += dt;
    const t = seq.elapsed;
    const {
      attackerType,
      attackerColor,
      attackerGroup,
      victimGroup,
      startX,
      startZ,
      victimX,
      victimZ,
      attackAngleY,
      duration,
      bloodPool,
      fireCones,
      magicOrb,
      ironSpikes,
      stageFlags,
    } = seq;

    const rig = attackerGroup.userData.rig as PieceRig;
    const dirX = Math.sin(attackAngleY);
    const dirZ = Math.cos(attackAngleY);

    const once = (key: string, fn: () => void) => {
      if (!stageFlags.has(key)) {
        stageFlags.add(key);
        fn();
      }
    };

    if (attackerType === 'b') {
      // ALFIL: Levanta crucifijo -> sale sangre del crucifijo -> arde la pieza víctima (6.2s)
      const standX = victimX - dirX * 0.72;
      const standZ = victimZ - dirZ * 0.72;
      if (t < 0.9) {
        const u = Math.min(1, t / 0.9);
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(startX, standX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(startZ, standZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, attackAngleY, 0.25);
      } else if (t < 1.85) {
        // Bishop raises & displays the crucifix prominently toward the attacked piece (NO blood)
        attackerGroup.position.set(standX, BOARD_TOP_Y, standZ);
        rig.visualGroup.rotation.y = attackAngleY;
        const u = (t - 0.9) / 0.95;
        const ease = u * u * (3 - 2 * u);
        if (rig.bishopStaffPivot) {
          rig.bishopStaffPivot.position.y = THREE.MathUtils.lerp(0.72, 1.08, ease);
          rig.bishopStaffPivot.position.z = THREE.MathUtils.lerp(0.06, 0.22, ease);
          rig.bishopStaffPivot.rotation.x = THREE.MathUtils.lerp(0, 0.96, ease);
        }
        rig.visualGroup.rotation.x = -0.1 * ease;
      } else if (t < 5.3) {
        // Crucifix held aloft emitting radiant fire sparks while victim burns fiercely in flames (zero blood)
        if (rig.bishopStaffPivot) {
          rig.bishopStaffPivot.position.y = 1.08;
          rig.bishopStaffPivot.position.z = 0.22;
          rig.bishopStaffPivot.rotation.x = 0.96 + Math.sin(t * 7) * 0.05;
        }
        if (t < 4.5 && rig.bishopCrossTip && Math.random() < 0.45) {
          rig.bishopCrossTip.getWorldPosition(_v3);
          this.spawnSparkBurst(_v3.x, _v3.y, _v3.z, 1, 0xff8811, 1.4, 0.8, 0.75, -0.4);
        }
        // Victim ignites immediately and burns to ash from t=1.85s -> 5.3s
        once('fireStart', () => {
          this.trauma = Math.min(1, this.trauma + 0.45);
          this.spawnSparkBurst(victimX, 0.45, victimZ, 28, 0xff5500, 3.2, 1.8, 1.25, -1.0);
        });
        const burnU = Math.min(1, (t - 1.85) / 3.45);
        fireCones.forEach((cone, idx) => {
          const flicker = 0.85 + Math.sin(t * 18 + idx * 1.6) * 0.28;
          const grow = Math.min(1, (t - 1.85) / 0.45) * (1 - Math.max(0, (t - 4.9) / 0.4));
          cone.scale.set(
            grow * (1.1 + (idx % 3) * 0.14),
            grow * flicker * (1.45 + (idx % 2) * 0.48),
            grow * (1.1 + (idx % 3) * 0.14),
          );
          cone.rotation.y += dt * (idx % 2 === 0 ? 2.8 : -2.8);
        });
        if (Math.random() < 0.88) {
          const fireHex = Math.random() > 0.5 ? 0xff3300 : Math.random() > 0.5 ? 0xff7700 : 0xffcc22;
          this.spawnSparkBurst(victimX, 0.52, victimZ, 3, fireHex, 3.2, 0.95, 1.25, -1.4);
        }
        victimGroup.position.set(
          victimX + Math.sin(t * 44) * 0.05 * (1 - burnU),
          BOARD_TOP_Y - burnU * 0.08,
          victimZ + Math.cos(t * 39) * 0.05 * (1 - burnU),
        );
        const shrinkY = Math.max(0.02, 1 - burnU * 0.96);
        const shrinkXZ = Math.max(0.05, 1 - burnU * 0.65);
        victimGroup.scale.set(shrinkXZ, shrinkY, shrinkXZ);
        if (burnU > 0.95) victimGroup.visible = false;
      } else {
        victimGroup.visible = false;
        fireCones.forEach((c) => {
          c.visible = false;
        });
        const u = Math.min(1, (t - 5.3) / (duration - 5.3));
        const ease = u * u * (3 - 2 * u);
        if (rig.bishopStaffPivot) {
          rig.bishopStaffPivot.position.y = THREE.MathUtils.lerp(1.08, 0.72, ease);
          rig.bishopStaffPivot.position.z = THREE.MathUtils.lerp(0.22, 0.06, ease);
          rig.bishopStaffPivot.rotation.x = THREE.MathUtils.lerp(0.96, 0, ease);
        }
        rig.visualGroup.rotation.x = THREE.MathUtils.lerp(-0.1, 0, ease);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(standX, victimX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(standZ, victimZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(attackAngleY, rig.defaultFacingY, ease);
      }
    } else if (attackerType === 'k') {
      // REY (Conde Drácula): Rodea lateralmente y muerde en el CUELLO (no de frente) -> víctima consumida (6.8s)
      const perpX = -dirZ;
      const perpZ = dirX;
      const flankX = victimX - dirX * 0.14 + perpX * 0.44;
      const flankZ = victimZ - dirZ * 0.14 + perpZ * 0.44;
      const biteNeckX = victimX - dirX * 0.08 + perpX * 0.25;
      const biteNeckZ = victimZ - dirZ * 0.08 + perpZ * 0.25;
      const neckAngleY = Math.atan2(victimX - flankX, victimZ - flankZ);

      if (t < 0.95) {
        // Glide to the side of the victim's neck instead of straight-on front
        const u = t / 0.95;
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(startX, flankX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(startZ, flankZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, neckAngleY, 0.28);
      } else if (t < 1.85) {
        // Tilt head sideways over the victim's neck & bare fangs
        attackerGroup.position.set(flankX, BOARD_TOP_Y, flankZ);
        rig.visualGroup.rotation.y = neckAngleY;
        const u = (t - 0.95) / 0.9;
        rig.visualGroup.rotation.x = 0.08 * u;
        if (rig.kingHeadPivot) {
          rig.kingHeadPivot.rotation.x = -0.18 * u;
          rig.kingHeadPivot.rotation.z = 0.34 * u;
        }
        if (rig.kingJawPivot) rig.kingJawPivot.rotation.x = 0.92 * u;
      } else if (t < 2.35) {
        // Lunge into the side of the victim's neck and sink fangs!
        const u = (t - 1.85) / 0.5;
        attackerGroup.position.set(
          THREE.MathUtils.lerp(flankX, biteNeckX, u),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(flankZ, biteNeckZ, u),
        );
        rig.visualGroup.rotation.y = neckAngleY;
        rig.visualGroup.rotation.x = THREE.MathUtils.lerp(0.08, 0.32, u);
        if (rig.kingHeadPivot) {
          rig.kingHeadPivot.rotation.x = THREE.MathUtils.lerp(-0.18, 0.26, u);
          rig.kingHeadPivot.rotation.z = THREE.MathUtils.lerp(0.34, 0.24, u);
        }
        if (rig.kingJawPivot) rig.kingJawPivot.rotation.x = THREE.MathUtils.lerp(0.92, 0.16, u);
        if (u > 0.65) {
          once('biteImpact', () => {
            this.trauma = Math.min(1, this.trauma + 0.65);
            this.spawnBloodBurst(
              victimX + perpX * 0.08,
              0.82,
              victimZ + perpZ * 0.08,
              30,
              1.4,
              3.6,
              1.8,
              4.0,
              1.0,
            );
          });
        }
      } else if (t < 5.5) {
        // Latched sideways onto the neck, draining blood while victim is consumed
        const drainU = (t - 2.35) / 3.15;
        const pulse = Math.sin(t * 10) * 0.04;
        attackerGroup.position.set(biteNeckX, BOARD_TOP_Y, biteNeckZ);
        rig.visualGroup.rotation.y = neckAngleY;
        rig.visualGroup.rotation.x = 0.32 + pulse;
        if (rig.kingHeadPivot) {
          rig.kingHeadPivot.rotation.x = 0.26 + pulse * 1.2;
          rig.kingHeadPivot.rotation.z = 0.24 + pulse * 0.6;
        }
        if (rig.kingJawPivot) rig.kingJawPivot.rotation.x = 0.18 + Math.abs(Math.sin(t * 8)) * 0.18;

        if (Math.random() < 0.62) {
          this.spawnBloodStream(
            victimX + perpX * 0.08,
            0.8 * (1 - drainU * 0.58),
            victimZ + perpZ * 0.08,
            biteNeckX,
            1.02,
            biteNeckZ,
            2,
          );
        }
        bloodPool.scale.setScalar(0.15 + drainU * 1.25);

        victimGroup.position.set(
          victimX + Math.sin(t * 36) * 0.03 * (1 - drainU),
          BOARD_TOP_Y,
          victimZ + Math.cos(t * 32) * 0.03 * (1 - drainU),
        );
        const sXZ = Math.max(0.01, 1 - drainU * 0.96);
        const sY = Math.max(0.01, 1 - Math.pow(drainU, 1.3) * 0.98);
        victimGroup.scale.set(sXZ, sY, sXZ);
        victimGroup.rotation.z = Math.sin(t * 14) * 0.14 * drainU;
        if (drainU > 0.96) victimGroup.visible = false;
      } else {
        victimGroup.visible = false;
        const u = Math.min(1, (t - 5.5) / (duration - 5.5));
        const ease = u * u * (3 - 2 * u);
        rig.visualGroup.rotation.x = THREE.MathUtils.lerp(0.32, 0, ease);
        if (rig.kingHeadPivot) {
          rig.kingHeadPivot.rotation.x = THREE.MathUtils.lerp(0.26, 0, ease);
          rig.kingHeadPivot.rotation.z = THREE.MathUtils.lerp(0.24, 0, ease);
        }
        if (rig.kingJawPivot) rig.kingJawPivot.rotation.x = THREE.MathUtils.lerp(0.18, 0, ease);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(biteNeckX, victimX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(biteNeckZ, victimZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(neckAngleY, rig.defaultFacingY, ease);
      }
    } else if (attackerType === 'q') {
      // REINA (Maléfica): Saca las 2 manos -> bola morada (roja) o azul (verde/negra) en mano izquierda -> la coge con derecha -> la tira -> desintegra víctima (7.0s)
      const standX = victimX - dirX * 1.05;
      const standZ = victimZ - dirZ * 1.05;
      const palette = getQueenMagicOrbPalette(attackerColor);

      if (t < 0.9) {
        const u = t / 0.9;
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(startX, standX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(startZ, standZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, attackAngleY, 0.25);
      } else if (t < 1.9) {
        rig.visualGroup.rotation.y = attackAngleY;
        const u = (t - 0.9) / 1.0;
        const ease = u * u * (3 - 2 * u);
        if (rig.queenLeftArmPivot) {
          rig.queenLeftArmPivot.scale.setScalar(Math.max(0.001, ease));
          rig.queenLeftArmPivot.rotation.set(-0.15 * ease, -0.18 * ease, 0);
        }
        if (rig.queenRightArmPivot) {
          rig.queenRightArmPivot.scale.setScalar(Math.max(0.001, ease));
          rig.queenRightArmPivot.rotation.set(-0.15 * ease, 0.18 * ease, 0);
        }
        if (rig.queenScepterPivot) rig.queenScepterPivot.rotation.z = -0.35 * ease;
      } else if (t < 3.5) {
        // Generate purple (w) or blue (b) magic orb in LEFT hand
        const u = (t - 1.9) / 1.6;
        if (rig.queenLeftArmPivot) rig.queenLeftArmPivot.scale.setScalar(1);
        if (rig.queenRightArmPivot) rig.queenRightArmPivot.scale.setScalar(1);
        if (magicOrb && rig.queenLeftHandAnchor) {
          magicOrb.visible = true;
          rig.queenLeftHandAnchor.getWorldPosition(_v3);
          magicOrb.position.copy(_v3);
          magicOrb.scale.setScalar(0.12 + u * 0.95 + Math.sin(t * 14) * 0.06);
          magicOrb.rotation.y += dt * 4.5;
          if (Math.random() < 0.55) {
            this.spawnSparkBurst(_v3.x, _v3.y, _v3.z, 2, palette.sparkHex, 1.1, 0.7, 0.75, 0.2);
          }
        }
      } else if (t < 4.4) {
        // Right hand reaches across, grabs the orb from left hand, and winds back to throw
        const u = (t - 3.5) / 0.9;
        if (u < 0.45) {
          const reach = u / 0.45;
          if (rig.queenRightArmPivot) {
            rig.queenRightArmPivot.rotation.y = THREE.MathUtils.lerp(0.18, 0.48, reach);
            rig.queenRightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.15, -0.05, reach);
          }
          if (magicOrb && rig.queenLeftHandAnchor) {
            rig.queenLeftHandAnchor.getWorldPosition(_v3);
            magicOrb.position.copy(_v3);
          }
        } else {
          const pullBack = (u - 0.45) / 0.55;
          if (rig.queenRightArmPivot) {
            rig.queenRightArmPivot.rotation.y = THREE.MathUtils.lerp(0.48, -0.35, pullBack);
            rig.queenRightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.05, -0.78, pullBack);
          }
          if (rig.queenLeftArmPivot) {
            rig.queenLeftArmPivot.rotation.x = THREE.MathUtils.lerp(-0.15, 0.3, pullBack);
          }
          if (magicOrb && rig.queenRightHandAnchor) {
            rig.queenRightHandAnchor.getWorldPosition(_v3);
            magicOrb.position.copy(_v3);
            magicOrb.scale.setScalar(1.1 + Math.sin(t * 18) * 0.08);
          }
        }
      } else if (t < 5.05) {
        // Right arm whips forward and throws orb straight into the victim
        const u = (t - 4.4) / 0.65;
        if (rig.queenRightArmPivot) {
          rig.queenRightArmPivot.rotation.x = THREE.MathUtils.lerp(-0.78, 0.52, Math.min(1, u * 2.5));
          rig.queenRightArmPivot.rotation.y = THREE.MathUtils.lerp(-0.35, 0.05, Math.min(1, u * 2.5));
        }
        if (magicOrb && rig.queenRightHandAnchor) {
          if (u < 0.28) {
            rig.queenRightHandAnchor.getWorldPosition(_v3);
            magicOrb.position.copy(_v3);
          } else {
            const flightU = (u - 0.28) / 0.72;
            rig.queenRightHandAnchor.getWorldPosition(_v3);
            _v3b.set(victimX, 0.65, victimZ);
            magicOrb.position.lerpVectors(_v3, _v3b, flightU);
            magicOrb.scale.setScalar(1.15 + flightU * 0.4);
            if (Math.random() < 0.7) {
              this.spawnSparkBurst(magicOrb.position.x, magicOrb.position.y, magicOrb.position.z, 2, palette.sparkHex, 0.6, 0.5, 0.85, 0);
            }
          }
        }
      } else if (t < 6.25) {
        // Impact detonation + violent disintegration of victim!
        once('orbDetonate', () => {
          if (magicOrb) magicOrb.visible = false;
          this.trauma = Math.min(1, this.trauma + 0.85);
          this.spawnSparkBurst(victimX, 0.7, victimZ, 42, palette.sparkHex, 3.4, 4.2, 1.35, 4.8);
          this.spawnBloodBurst(victimX, 0.7, victimZ, 34, 1.8, 4.4, 2.2, 5.0, 1.0);
        });
        const disU = (t - 5.05) / 1.2;
        bloodPool.scale.setScalar(0.1 + disU * 1.2);
        if (Math.random() < 0.65 && disU < 0.75) {
          this.spawnSparkBurst(victimX, 0.45, victimZ, 2, palette.coreColor, 2.2, 1.8, 0.9, 1.2);
        }
        victimGroup.position.set(
          victimX + Math.sin(t * 50) * 0.06 * (1 - disU),
          BOARD_TOP_Y + disU * 0.25,
          victimZ + Math.cos(t * 45) * 0.06 * (1 - disU),
        );
        victimGroup.rotation.y += dt * 14;
        const shrink = Math.max(0.001, 1 - Math.pow(disU, 0.7));
        victimGroup.scale.setScalar(shrink);
        if (disU > 0.92) victimGroup.visible = false;
      } else {
        victimGroup.visible = false;
        const u = Math.min(1, (t - 6.25) / (duration - 6.25));
        const ease = u * u * (3 - 2 * u);
        if (rig.queenLeftArmPivot) rig.queenLeftArmPivot.scale.setScalar(Math.max(0.001, 1 - ease));
        if (rig.queenRightArmPivot) rig.queenRightArmPivot.scale.setScalar(Math.max(0.001, 1 - ease));
        if (rig.queenScepterPivot) rig.queenScepterPivot.rotation.z = THREE.MathUtils.lerp(-0.35, 0, ease);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(standX, victimX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(standZ, victimZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(attackAngleY, rig.defaultFacingY, ease);
      }
    } else if (attackerType === 'p') {
      // PEÓN (Bebé Zombi): Abre la boca enorme (solo se ve la boca, SIN sangre) y al MORDER al objetivo sale sangre y se lo come (6.0s)
      const standX = victimX - dirX * 0.62;
      const standZ = victimZ - dirZ * 0.62;
      const biteX = victimX - dirX * 0.24;
      const biteZ = victimZ - dirZ * 0.24;

      if (t < 0.75) {
        const u = t / 0.75;
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(startX, standX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(startZ, standZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, attackAngleY, 0.25);
      } else if (t < 2.05) {
        // Giant gaping mouth opens wide (arms tucked away so ONLY the huge open mouth is visible, ZERO blood yet)
        attackerGroup.position.set(standX, BOARD_TOP_Y, standZ);
        rig.visualGroup.rotation.y = attackAngleY;
        const u = (t - 0.75) / 1.3;
        const ease = u * u * (3 - 2 * u);
        if (rig.pawnUpperHeadPivot) {
          rig.pawnUpperHeadPivot.rotation.x = -0.98 * ease;
          rig.pawnUpperHeadPivot.scale.setScalar(1 + 0.72 * ease);
        }
        if (rig.pawnLowerJawPivot) {
          rig.pawnLowerJawPivot.rotation.x = 1.42 * ease;
          rig.pawnLowerJawPivot.scale.set(1 + 1.18 * ease, 1 + 0.9 * ease, 1 + 1.05 * ease);
        }
        if (rig.pawnMawMesh) {
          rig.pawnMawMesh.scale.set(0.01 + 1.32 * ease, 0.01 + 1.18 * ease, 0.01 + 1.02 * ease);
        }
        const armScale = Math.max(0.001, 1 - ease);
        if (rig.pawnLeftArmPivot) rig.pawnLeftArmPivot.scale.setScalar(armScale);
        if (rig.pawnRightArmPivot) rig.pawnRightArmPivot.scale.setScalar(armScale);
      } else if (t < 2.5) {
        // Lunge straight onto target with mouth wide open — still NO blood until exact bite contact!
        const u = (t - 2.05) / 0.45;
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(standX, biteX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(standZ, biteZ, ease),
        );
        rig.visualGroup.rotation.y = attackAngleY;
      } else if (t < 4.55) {
        // BITES DOWN on the attacked target -> blood bubbles burst out of the pawn's red open mouth!
        const eatU = (t - 2.5) / 2.05;
        const chompWave = Math.sin((t - 2.5) * Math.PI * 3.4);
        attackerGroup.position.set(biteX, BOARD_TOP_Y, biteZ);
        if (rig.pawnUpperHeadPivot) {
          rig.pawnUpperHeadPivot.rotation.x = -0.58 + chompWave * 0.36;
          rig.pawnUpperHeadPivot.scale.setScalar(1.72);
        }
        if (rig.pawnLowerJawPivot) {
          rig.pawnLowerJawPivot.rotation.x = 0.82 - chompWave * 0.56;
          rig.pawnLowerJawPivot.scale.set(2.18, 1.9, 2.05);
        }
        if (rig.pawnMawMesh) {
          rig.pawnMawMesh.scale.set(1.32, 1.18, 1.02);
        }
        attackerGroup.updateMatrixWorld(true);
        if (rig.pawnMouthAnchor) {
          rig.pawnMouthAnchor.getWorldPosition(_v3);
        } else {
          _v3.set(biteX + dirX * 0.2, 0.62, biteZ + dirZ * 0.2);
        }
        once('pawnBiteBlood', () => {
          bloodPool.visible = true;
          this.trauma = Math.min(1, this.trauma + 0.6);
          this.spawnBloodBurst(_v3.x, _v3.y, _v3.z, 32, 0.9, 3.1, 1.5, 4.1, 1.05, dirX * 1.1, dirZ * 1.1);
          this.spawnBloodBurst(victimX, 0.55, victimZ, 12, 0.9, 2.6, 1.2, 3.2, 0.95);
        });
        const mawWorldX = biteX + dirX * 0.14;
        const mawWorldZ = biteZ + dirZ * 0.14;
        victimGroup.position.set(
          THREE.MathUtils.lerp(victimX, mawWorldX, eatU),
          BOARD_TOP_Y + Math.sin(eatU * Math.PI) * 0.45,
          THREE.MathUtils.lerp(victimZ, mawWorldZ, eatU),
        );
        victimGroup.rotation.x = eatU * 1.1;
        const swallowScale = Math.max(0.01, 1 - Math.pow(eatU, 1.35));
        victimGroup.scale.setScalar(swallowScale);
        if (eatU > 0.94) victimGroup.visible = false;

        const chompBeat = Math.floor((t - 2.5) / 0.28);
        once(`pawnChomp${chompBeat}`, () => {
          this.spawnBloodBurst(_v3.x, _v3.y, _v3.z, 8, 0.75, 2.4, 1.1, 3.3, 0.98, dirX * 0.9, dirZ * 0.9);
        });
        if (Math.random() < Math.min(0.88, dt * 36)) {
          this.spawnBloodBurst(_v3.x, _v3.y, _v3.z, 3, 0.7, 2.2, 1.0, 3.0, 0.92, dirX * 0.85, dirZ * 0.85);
        }
        bloodPool.scale.setScalar(0.15 + eatU * 1.15);
        if (eatU > 0.45) once('chomp2', () => { this.trauma = Math.min(1, this.trauma + 0.45); });
      } else if (t < 5.25) {
        victimGroup.visible = false;
        const u = (t - 4.55) / 0.7;
        if (rig.pawnUpperHeadPivot) {
          rig.pawnUpperHeadPivot.rotation.x = THREE.MathUtils.lerp(-0.4, 0, u);
          rig.pawnUpperHeadPivot.scale.setScalar(THREE.MathUtils.lerp(1.72, 1, u));
        }
        if (rig.pawnLowerJawPivot) {
          rig.pawnLowerJawPivot.rotation.x = THREE.MathUtils.lerp(0.55, 0, u);
          rig.pawnLowerJawPivot.scale.setScalar(THREE.MathUtils.lerp(2.0, 1, u));
        }
        if (rig.pawnMawMesh) {
          rig.pawnMawMesh.scale.setScalar(Math.max(0.001, THREE.MathUtils.lerp(1.25, 0.001, u)));
        }
        const armBack = Math.max(0.001, u);
        if (rig.pawnLeftArmPivot) {
          rig.pawnLeftArmPivot.rotation.set(0, 0, 0);
          rig.pawnLeftArmPivot.scale.setScalar(armBack);
        }
        if (rig.pawnRightArmPivot) {
          rig.pawnRightArmPivot.rotation.set(0, 0, 0);
          rig.pawnRightArmPivot.scale.setScalar(armBack);
        }
      } else {
        const u = Math.min(1, (t - 5.25) / (duration - 5.25));
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(biteX, victimX, ease),
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(biteZ, victimZ, ease),
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(attackAngleY, rig.defaultFacingY, ease);
      }
    } else if (attackerType === 'n') {
      // CABALLO (Zombi con Armadura Fantasma): Salto equino realista + aplastamiento mortal con cascos y desgarro (6.4s)
      if (t < 1.35) {
        const u = t / 1.35;
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, attackAngleY, 0.28);
        if (u < 0.22) {
          const crouch = u / 0.22;
          attackerGroup.position.set(startX, BOARD_TOP_Y, startZ);
          attackerGroup.scale.set(1 + crouch * 0.08, 1 - crouch * 0.12, 1 + crouch * 0.08);
          if (rig.knightNeckPivot) rig.knightNeckPivot.rotation.x = -0.38 * crouch;
        } else {
          const jumpU = (u - 0.22) / 0.78;
          const arcY = Math.sin(jumpU * Math.PI) * 1.72;
          attackerGroup.scale.set(1, 1, 1);
          attackerGroup.position.set(
            THREE.MathUtils.lerp(startX, victimX, jumpU),
            BOARD_TOP_Y + arcY,
            THREE.MathUtils.lerp(startZ, victimZ, jumpU),
          );
          rig.visualGroup.rotation.x = (0.5 - jumpU) * -0.55;
          if (rig.knightNeckPivot) rig.knightNeckPivot.rotation.x = THREE.MathUtils.lerp(-0.38, 0.32, jumpU);
        }
      } else if (t < 4.7) {
        once('knightSlam', () => {
          this.trauma = Math.min(1, this.trauma + 0.85);
          this.spawnBloodBurst(victimX, 0.45, victimZ, 40, 1.8, 4.5, 2.2, 5.0, 1.15);
          this.spawnSparkBurst(victimX, 0.4, victimZ, 18, 0x0ea662, 2.2, 3.0, 1.0, 4.0);
        });
        const maulU = (t - 1.35) / 3.35;
        // Second stomp hop + savage downward bite/maul
        const stompHop = maulU < 0.38 ? Math.sin((maulU / 0.38) * Math.PI) * 0.65 : 0;
        if (maulU > 0.36) {
          once('knightStomp2', () => {
            this.trauma = Math.min(1, this.trauma + 0.6);
            this.spawnBloodBurst(victimX, 0.3, victimZ, 26, 1.4, 3.5, 1.8, 4.0, 1.0);
          });
        }
        attackerGroup.position.set(victimX, BOARD_TOP_Y + stompHop, victimZ);
        rig.visualGroup.rotation.x = maulU > 0.4 ? 0.32 + Math.sin(t * 14) * 0.14 : -0.15 * stompHop;
        if (rig.knightNeckPivot) {
          rig.knightNeckPivot.rotation.x = maulU > 0.4 ? 0.75 + Math.sin(t * 16) * 0.2 : -0.25;
        }
        if (maulU > 0.42 && Math.random() < 0.45) {
          this.spawnBloodBurst(victimX, 0.2, victimZ, 2, 1.0, 2.6, 1.4, 2.8, 0.8);
        }
        bloodPool.scale.setScalar(0.25 + maulU * 1.25);
        victimGroup.position.set(victimX, BOARD_TOP_Y, victimZ);
        victimGroup.scale.set(
          1 + Math.min(0.4, maulU * 0.5) * (1 - maulU),
          Math.max(0.01, (1 - maulU) * 0.25),
          1 + Math.min(0.4, maulU * 0.5) * (1 - maulU),
        );
        if (maulU > 0.85) victimGroup.visible = false;
      } else {
        victimGroup.visible = false;
        const u = Math.min(1, (t - 4.7) / (duration - 4.7));
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(victimX, BOARD_TOP_Y, victimZ);
        rig.visualGroup.rotation.x = THREE.MathUtils.lerp(0.32, 0, ease);
        if (rig.knightNeckPivot) rig.knightNeckPivot.rotation.x = THREE.MathUtils.lerp(0.75, 0, ease);
        rig.visualGroup.rotation.y = shortestAngleLerp(attackAngleY, rig.defaultFacingY, ease);
      }
    } else {
      // TORRE (Castillo del Conde Drácula): Estacas sangrientas empalan la víctima + castillo desciende y aplasta (6.5s)
      const standX = victimX - dirX * 0.8;
      const standZ = victimZ - dirZ * 0.8;

      if (t < 0.9) {
        const u = t / 0.9;
        const ease = u * u * (3 - 2 * u);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(startX, standX, ease) + Math.sin(t * 40) * 0.015,
          BOARD_TOP_Y,
          THREE.MathUtils.lerp(startZ, standZ, ease) + Math.cos(t * 36) * 0.015,
        );
        rig.visualGroup.rotation.y = shortestAngleLerp(rig.visualGroup.rotation.y, attackAngleY, 0.25);
      } else if (t < 2.3) {
        // Obsidian iron spikes burst through victim from beneath!
        const spikeU = Math.min(1, (t - 0.9) / 0.55);
        once('spikeImpale', () => {
          this.trauma = Math.min(1, this.trauma + 0.65);
          this.spawnBloodBurst(victimX, 0.55, victimZ, 36, 1.5, 3.8, 2.2, 4.8, 1.0);
        });
        ironSpikes.forEach((sp) => {
          sp.scale.set(1, 0.01 + spikeU * 1.25, 1);
        });
        victimGroup.position.set(
          victimX + Math.sin(t * 45) * 0.03,
          BOARD_TOP_Y + spikeU * 0.16,
          victimZ + Math.cos(t * 41) * 0.03,
        );
        bloodPool.scale.setScalar(0.1 + ((t - 0.9) / 1.4) * 0.8);
      } else if (t < 4.1) {
        // Castle levitates directly over impaled victim, spinning ominously
        const liftU = (t - 2.3) / 1.8;
        const ease = liftU * liftU * (3 - 2 * liftU);
        attackerGroup.position.set(
          THREE.MathUtils.lerp(standX, victimX, ease),
          BOARD_TOP_Y + Math.sin(Math.min(1, liftU * 1.3) * (Math.PI / 2)) * 1.35,
          THREE.MathUtils.lerp(standZ, victimZ, ease),
        );
        if (rig.rookBodyPivot) rig.rookBodyPivot.rotation.y += dt * 4.2;
        if (Math.random() < 0.35) {
          this.spawnBloodBurst(victimX, 0.5, victimZ, 1, 0.6, 1.8, 1.2, 2.4, 0.8);
        }
      } else if (t < 4.6) {
        // Guillotine crush slam!
        const slamU = (t - 4.1) / 0.5;
        const dropEase = slamU * slamU;
        attackerGroup.position.set(victimX, BOARD_TOP_Y + (1 - dropEase) * 1.35, victimZ);
        if (slamU > 0.72) {
          once('castleCrush', () => {
            this.trauma = Math.min(1, this.trauma + 0.95);
            this.spawnBloodBurst(victimX, 0.25, victimZ, 44, 2.2, 5.2, 1.6, 4.4, 1.2);
            this.spawnSparkBurst(victimX, 0.25, victimZ, 24, 0x998877, 2.0, 3.8, 1.0, 6.0);
          });
          victimGroup.scale.set(1.4, 0.03, 1.4);
          ironSpikes.forEach((sp) => { sp.scale.y = 0.05; });
        }
      } else {
        victimGroup.visible = false;
        ironSpikes.forEach((sp) => { sp.visible = false; });
        attackerGroup.position.set(victimX, BOARD_TOP_Y, victimZ);
        bloodPool.scale.setScalar(1.38);
        const u = Math.min(1, (t - 4.6) / (duration - 4.6));
        const ease = u * u * (3 - 2 * u);
        if (rig.rookBodyPivot) {
          rig.rookBodyPivot.rotation.y = shortestAngleLerp(rig.rookBodyPivot.rotation.y, 0, ease);
        }
        rig.visualGroup.rotation.y = shortestAngleLerp(attackAngleY, rig.defaultFacingY, ease);
      }
    }

    // Finish capture sequence cleanly
    if (t >= duration) {
      this.resetPieceRig(attackerGroup);
      attackerGroup.position.set(victimX, BOARD_TOP_Y, victimZ);
      attackerGroup.scale.set(1, 1, 1);
      this.clearCaptureFxGroup();
      this.captureSeq = null;
      this.callbacks.onCaptureStateChange?.(false);
    }
  }

  private updateSimulation(dt: number): void {
    this.elapsedTime += dt;

    // Remove previous frame's camera shake cleanly before OrbitControls/transitions run
    if (this.lastShakeOffset.lengthSq() > 0) {
      this.camera.position.sub(this.lastShakeOffset);
      this.lastShakeOffset.set(0, 0, 0);
    }

    // Asynchronous bright-red candle flickering across all 4 corner candelabra
    for (let i = 0; i < this.candleRigs.length; i++) {
      const rig = this.candleRigs[i];
      const f = computeCandleFlicker(this.elapsedTime, i);
      rig.outerFlame.scale.set(f.scaleXZ, f.scaleY, f.scaleXZ);
      rig.outerFlame.rotation.set(f.swayX, 0, f.swayZ);
      rig.innerFlame.scale.set(f.scaleXZ * 0.95, f.scaleY * 1.05, f.scaleXZ * 0.95);
      rig.innerFlame.rotation.set(f.swayX * 0.7, 0, f.swayZ * 0.7);
      rig.halo.scale.setScalar(0.92 + (f.intensity - 2.0) * 0.14);
      rig.light.intensity = f.intensity;
    }

    if (this.titleOrbitMode) {
      this.titleOrbitAngle += dt * 0.22;
      const radius = 11.2;
      this.camera.position.set(
        Math.sin(this.titleOrbitAngle) * radius - 1.4,
        6.9,
        Math.cos(this.titleOrbitAngle) * radius,
      );
      this.controls.target.set(-1.7, 0.35, 0);
    } else if (this.camTransition.active) {
      const k = 1 - Math.exp(-7 * dt);
      this.camera.position.lerp(this.camTransition.targetPos, k);
      this.controls.target.lerp(this.camTransition.targetLook, k);
      if (this.camera.position.distanceToSquared(this.camTransition.targetPos) < 0.002) {
        this.camera.position.copy(this.camTransition.targetPos);
        this.controls.target.copy(this.camTransition.targetLook);
        this.camTransition.active = false;
      }
    }

    // Active piece movement animations: ONLY Knight jumps realistically; all others slide grounded!
    for (let i = this.activeAnims.length - 1; i >= 0; i--) {
      const anim = this.activeAnims[i];
      anim.progress = Math.min(1, anim.progress + dt / anim.duration);
      const t = anim.progress;
      const rig = anim.group.userData.rig as PieceRig | undefined;
      const isKnight = canPieceJump(anim.type);

      if (isKnight) {
        // Phase 1 (0..0.16): crouch & rear up; Phase 2 (0.16..0.84): parabolic leap; Phase 3 (0.84..1): hoof absorb
        const moveU = t < 0.16 ? 0 : t > 0.84 ? 1 : (t - 0.16) / 0.68;
        const ease = moveU * moveU * (3 - 2 * moveU);
        const x = THREE.MathUtils.lerp(anim.startX, anim.endX, ease);
        const z = THREE.MathUtils.lerp(anim.startZ, anim.endZ, ease);
        const jumpY = computeMoveHeight('n', t);
        anim.group.position.set(x, BOARD_TOP_Y + jumpY, z);

        if (rig) {
          rig.visualGroup.rotation.y = shortestAngleLerp(
            rig.visualGroup.rotation.y,
            t < 0.8 ? anim.moveFacingY : anim.defaultFacingY,
            0.22,
          );
          if (t < 0.16) {
            const p = t / 0.16;
            anim.group.scale.set(1 + p * 0.07, 1 - p * 0.1, 1 + p * 0.07);
            rig.visualGroup.rotation.x = -0.16 * p;
            if (rig.knightNeckPivot) rig.knightNeckPivot.rotation.x = -0.34 * p;
          } else if (t <= 0.84) {
            anim.group.scale.set(0.96, 1.07, 0.96);
            rig.visualGroup.rotation.x = (0.5 - moveU) * -0.44;
            if (rig.knightNeckPivot) {
              rig.knightNeckPivot.rotation.x = THREE.MathUtils.lerp(-0.34, 0.24, moveU);
            }
          } else {
            const landP = (t - 0.84) / 0.16;
            const squash = Math.sin(landP * Math.PI) * 0.12;
            anim.group.scale.set(1 + squash, 1 - squash, 1 + squash);
            rig.visualGroup.rotation.x = THREE.MathUtils.lerp(0.2, 0, landP);
            if (rig.knightNeckPivot) {
              rig.knightNeckPivot.rotation.x = THREE.MathUtils.lerp(0.24, 0, landP);
            }
          }
        }
      } else {
        // Grounded slide / glide (zero vertical jumping)
        const ease = t * t * (3 - 2 * t);
        const x = THREE.MathUtils.lerp(anim.startX, anim.endX, ease);
        const z = THREE.MathUtils.lerp(anim.startZ, anim.endZ, ease);
        anim.group.position.set(x, BOARD_TOP_Y, z);

        if (rig) {
          rig.visualGroup.rotation.y = shortestAngleLerp(
            rig.visualGroup.rotation.y,
            t < 0.72 ? anim.moveFacingY : anim.defaultFacingY,
            0.25,
          );
          rig.visualGroup.rotation.x = Math.sin(t * Math.PI) * 0.09;
          if (anim.type === 'p') {
            rig.visualGroup.rotation.z = Math.sin(t * Math.PI * 3) * 0.06;
          }
        }
      }

      if (t >= 1) {
        anim.bouncePhase += dt;
        const bt = anim.bouncePhase / 0.14;
        if (bt >= 1) {
          anim.group.scale.set(1, 1, 1);
          anim.group.position.set(anim.endX, BOARD_TOP_Y, anim.endZ);
          if (rig) {
            rig.visualGroup.rotation.set(0, anim.defaultFacingY, 0);
            if (rig.knightNeckPivot) rig.knightNeckPivot.rotation.x = 0;
          }
          this.activeAnims.splice(i, 1);
        } else if (isKnight) {
          const squash = Math.sin(bt * Math.PI) * 0.07;
          anim.group.scale.set(1 + squash, 1 - squash, 1 + squash);
        } else {
          if (rig) {
            rig.visualGroup.rotation.y = shortestAngleLerp(
              rig.visualGroup.rotation.y,
              anim.defaultFacingY,
              0.45,
            );
            rig.visualGroup.rotation.x *= 1 - bt;
            rig.visualGroup.rotation.z *= 1 - bt;
          }
        }
      }
    }

    // Active 5-10s capture gore sequence
    if (this.captureSeq) {
      this.updateCaptureSequence(dt);
    }

    // Update Blood Particles
    let anyBlood = false;
    for (let i = 0; i < BLOOD_PARTICLE_COUNT; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) continue;
      anyBlood = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -10, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.bloodMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.025) {
        p.y = 0.025;
        p.vx *= 0.45;
        p.vz *= 0.45;
        p.vy = 0;
      }
      const fade = 1 - p.life / p.maxLife;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(
        p.scale * (p.y <= 0.03 ? 1.55 : 0.85) * fade,
        p.scale * (p.y <= 0.03 ? 0.25 : 1.25) * fade,
        p.scale * (p.y <= 0.03 ? 1.55 : 0.85) * fade,
      );
      _dummy.updateMatrix();
      this.bloodMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anyBlood) {
      this.bloodMesh.instanceMatrix.needsUpdate = true;
    }

    // Update Fire/Magic/Bone Sparks
    let anySpark = false;
    for (let i = 0; i < SPARK_PARTICLE_COUNT; i++) {
      const p = this.sparkParticles[i];
      if (!p.active) continue;
      anySpark = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -10, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.35;
      }
      const fade = 1 - p.life / p.maxLife;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.life * 7, p.life * 5, 0);
      _dummy.scale.setScalar(p.scale * fade);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anySpark) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }

    this.controls.update();

    // Decaying trauma micro-shake on heavy impacts (applied cleanly after OrbitControls)
    if (this.trauma > 0.001) {
      const shakeAmt = this.trauma * this.trauma * 0.14;
      this.lastShakeOffset.set(
        (Math.random() - 0.5) * shakeAmt,
        (Math.random() - 0.5) * shakeAmt * 0.7,
        (Math.random() - 0.5) * shakeAmt,
      );
      this.camera.position.add(this.lastShakeOffset);
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
    }
  }

  private renderBusy = false;
  private renderDirty = false;

  private requestRender(): void {
    if (this.disposed) return;
    if (!this.isSoftwareGl) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.016), 0.55);

      this.updateSimulation(dt);
      this.renderer.render(this.scene, this.camera);

      const hasActiveMotion =
        this.activeAnims.length > 0 ||
        this.captureSeq !== null ||
        this.camTransition.active ||
        this.bloodParticles.some((p) => p.active) ||
        this.sparkParticles.some((p) => p.active);

      // On software WebGL: pace active motion smoothly (24ms) and candle flicker asynchronously (90ms)
      this.afterDraw(() => {
        this.renderBusy = false;
        this.requestRender();
      }, hasActiveMotion ? 24 : 90);
    });
  }

  private afterDraw(cb: () => void, delayMs: number): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, delayMs);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, delayMs);
    }
  }

  private startLoop(): void {
    if (this.isSoftwareGl) {
      this.controls.addEventListener('change', () => this.requestRender());
      this.updateSimulation(0.016);
      this.renderer.render(this.scene, this.camera);
      this.requestRender();
      return;
    }

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      this.updateSimulation(dt);
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearCaptureFxGroup();
    this.textures.dispose();
    this.materials.dispose();
    this.pieceGeos.dispose();
    this.extraDisposables.forEach((d) => d.dispose());
    while (this.highlightGroup.children.length > 0) {
      const c = this.highlightGroup.children[0] as THREE.Mesh;
      this.highlightGroup.remove(c);
      c.geometry.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
