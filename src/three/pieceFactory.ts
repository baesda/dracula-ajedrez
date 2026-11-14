import * as THREE from 'three';
import type { PieceType, TeamColor } from '../chess/types';
import type { DraculaMaterials } from './materials';

function createPedestalGeometry(baseRadius: number, height: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(baseRadius, 0),
    new THREE.Vector2(baseRadius * 1.02, height * 0.16),
    new THREE.Vector2(baseRadius * 0.86, height * 0.36),
    new THREE.Vector2(baseRadius * 0.94, height * 0.56),
    new THREE.Vector2(baseRadius * 0.72, height * 0.8),
    new THREE.Vector2(baseRadius * 0.78, height),
    new THREE.Vector2(0.001, height),
  ];
  return new THREE.LatheGeometry(pts, 28);
}

/**
 * Builds a tapered, organically ribbed Maleficent horn along a 3D Catmull-Rom curve.
 * Radius tapers smoothly from a heavy temple base down to a sharp curved tip.
 */
function createTaperedMaleficentHorn(side: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.085, 0.0, 0.01),
    new THREE.Vector3(side * 0.25, 0.14, 0.05),
    new THREE.Vector3(side * 0.38, 0.34, 0.0),
    new THREE.Vector3(side * 0.34, 0.56, -0.07),
    new THREE.Vector3(side * 0.19, 0.76, -0.01),
    new THREE.Vector3(side * 0.11, 0.86, 0.06),
  ]);

  const tubularSegments = 28;
  const radialSegments = 12;
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 0.065, radialSegments, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, center);
    // Taper smoothly from 1.08 at root down to 0.08 at sharp tip, with subtle organic horn rings
    const ridge = 1 + Math.sin(t * Math.PI * 14) * 0.075 * (1 - t);
    const scale = Math.max(0.08, (1.12 * Math.pow(1 - t, 0.78) + 0.08) * ridge);

    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      v.fromBufferAttribute(pos, idx);
      v.sub(center).multiplyScalar(scale).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a curved wrapping gothic cloak shell around the back and shoulders.
 */
function createCurvedCloakGeometry(
  topR: number,
  botR: number,
  height: number,
  arcAngle: number,
): THREE.CylinderGeometry {
  const thetaLength = arcAngle;
  const thetaStart = Math.PI - thetaLength / 2; // centered at -Z (the back of the piece)
  return new THREE.CylinderGeometry(topR, botR, height, 20, 4, true, thetaStart, thetaLength);
}

function createPhantomCrossGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const w = 0.042;
  const arm = 0.175;
  const top = 0.27;
  const bot = -0.38;
  s.moveTo(-w, bot);
  s.lineTo(w, bot);
  s.lineTo(w, 0.02);
  s.lineTo(arm, 0.02);
  s.lineTo(arm, 0.105);
  s.lineTo(w, 0.105);
  s.lineTo(w, top);
  s.lineTo(-w, top);
  s.lineTo(-w, 0.105);
  s.lineTo(-arm, 0.105);
  s.lineTo(-arm, 0.02);
  s.lineTo(-w, 0.02);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.038,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

export interface PieceGeometryCache {
  pedestalSmall: THREE.LatheGeometry;
  pedestalMed: THREE.LatheGeometry;
  pedestalLarge: THREE.LatheGeometry;
  zombieSwaddle: THREE.LatheGeometry;
  castleKeep: THREE.LatheGeometry;
  castleTurret: THREE.CylinderGeometry;
  castleTurretCollar: THREE.CylinderGeometry;
  castleSpire: THREE.ConeGeometry;
  castleMainRoof: THREE.ConeGeometry;
  merlonBox: THREE.BoxGeometry;
  bishopRobe: THREE.LatheGeometry;
  warriorPauldron: THREE.SphereGeometry;
  phantomCross: THREE.ExtrudeGeometry;
  staffShaft: THREE.CylinderGeometry;
  queenGown: THREE.LatheGeometry;
  queenCloak: THREE.CylinderGeometry;
  kingTorso: THREE.LatheGeometry;
  kingCloak: THREE.CylinderGeometry;
  collarWing: THREE.BoxGeometry;
  sculptedCranium: THREE.SphereGeometry;
  sculptedJaw: THREE.BoxGeometry;
  muzzleCyl: THREE.CylinderGeometry;
  socketGeo: THREE.SphereGeometry;
  eyeGeo: THREE.SphereGeometry;
  ribTorus: THREE.TorusGeometry;
  vertebraBox: THREE.BoxGeometry;
  armGeo: THREE.CylinderGeometry;
  fangCone: THREE.ConeGeometry;
  hornLeft: THREE.BufferGeometry;
  hornRight: THREE.BufferGeometry;
  horseNeck: THREE.CylinderGeometry;
  chamfronGeo: THREE.CylinderGeometry;
  crownSpike: THREE.ConeGeometry;
  crownBand: THREE.TorusGeometry;
  gemOcta: THREE.OctahedronGeometry;
  shadowDisc: THREE.CircleGeometry;
  dispose: () => void;
}

export function createPieceGeometryCache(): PieceGeometryCache {
  const pedestalSmall = createPedestalGeometry(0.32, 0.16);
  const pedestalMed = createPedestalGeometry(0.36, 0.18);
  const pedestalLarge = createPedestalGeometry(0.39, 0.2);

  // Zombie baby tattered swaddle torso
  const zombieSwaddle = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.22, 0),
      new THREE.Vector2(0.24, 0.08),
      new THREE.Vector2(0.18, 0.25),
      new THREE.Vector2(0.16, 0.4),
      new THREE.Vector2(0.09, 0.48),
    ],
    22,
  );

  // Dracula Castle keep tower
  const castleKeep = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.31, 0),
      new THREE.Vector2(0.25, 0.2),
      new THREE.Vector2(0.22, 0.6),
      new THREE.Vector2(0.27, 0.72),
      new THREE.Vector2(0.27, 0.84),
      new THREE.Vector2(0.001, 0.84),
    ],
    18,
  );

  const castleTurret = new THREE.CylinderGeometry(0.068, 0.082, 0.7, 12);
  const castleTurretCollar = new THREE.CylinderGeometry(0.086, 0.07, 0.08, 12);
  const castleSpire = new THREE.ConeGeometry(0.092, 0.32, 12);
  const castleMainRoof = new THREE.ConeGeometry(0.24, 0.46, 14);
  const merlonBox = new THREE.BoxGeometry(0.082, 0.11, 0.082);

  // Phantasmagoric Warrior Bishop robe
  const bishopRobe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.28, 0),
      new THREE.Vector2(0.24, 0.24),
      new THREE.Vector2(0.18, 0.62),
      new THREE.Vector2(0.22, 0.78),
      new THREE.Vector2(0.13, 0.94),
      new THREE.Vector2(0.001, 0.96),
    ],
    24,
  );

  const warriorPauldron = new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const phantomCross = createPhantomCrossGeometry();
  const staffShaft = new THREE.CylinderGeometry(0.018, 0.014, 1.05, 8);

  // Maleficent Queen sculpted gown
  const queenGown = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.32, 0),
      new THREE.Vector2(0.26, 0.24),
      new THREE.Vector2(0.145, 0.56),
      new THREE.Vector2(0.19, 0.82),
      new THREE.Vector2(0.115, 0.95),
      new THREE.Vector2(0.001, 0.97),
    ],
    26,
  );
  const queenCloak = createCurvedCloakGeometry(0.21, 0.34, 1.04, Math.PI * 1.25);

  // Count Dracula King imposing armored torso + cape
  const kingTorso = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.33, 0),
      new THREE.Vector2(0.29, 0.28),
      new THREE.Vector2(0.24, 0.66),
      new THREE.Vector2(0.28, 0.9),
      new THREE.Vector2(0.15, 1.04),
      new THREE.Vector2(0.001, 1.06),
    ],
    26,
  );
  const kingCloak = createCurvedCloakGeometry(0.26, 0.4, 1.16, Math.PI * 1.32);
  const collarWing = new THREE.BoxGeometry(0.22, 0.34, 0.045);

  const sculptedCranium = new THREE.SphereGeometry(0.155, 22, 18);
  const sculptedJaw = new THREE.BoxGeometry(0.135, 0.105, 0.14);
  const muzzleCyl = new THREE.CylinderGeometry(0.068, 0.115, 0.36, 14);
  const socketGeo = new THREE.SphereGeometry(0.044, 12, 10);
  const eyeGeo = new THREE.SphereGeometry(0.022, 10, 8);
  const ribTorus = new THREE.TorusGeometry(0.135, 0.015, 7, 16, Math.PI * 1.2);
  const vertebraBox = new THREE.BoxGeometry(0.048, 0.036, 0.048);
  const armGeo = new THREE.CylinderGeometry(0.032, 0.022, 0.24, 10);
  const fangCone = new THREE.ConeGeometry(0.014, 0.056, 8);
  const hornLeft = createTaperedMaleficentHorn(-1);
  const hornRight = createTaperedMaleficentHorn(1);
  const horseNeck = new THREE.CylinderGeometry(0.125, 0.2, 0.56, 16);
  const chamfronGeo = new THREE.CylinderGeometry(0.075, 0.125, 0.38, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
  const crownSpike = new THREE.ConeGeometry(0.032, 0.15, 8);
  const crownBand = new THREE.TorusGeometry(0.118, 0.02, 8, 22);
  const gemOcta = new THREE.OctahedronGeometry(0.062, 0);
  const shadowDisc = new THREE.CircleGeometry(0.39, 24);

  const allGeos: THREE.BufferGeometry[] = [
    pedestalSmall,
    pedestalMed,
    pedestalLarge,
    zombieSwaddle,
    castleKeep,
    castleTurret,
    castleTurretCollar,
    castleSpire,
    castleMainRoof,
    merlonBox,
    bishopRobe,
    warriorPauldron,
    phantomCross,
    staffShaft,
    queenGown,
    queenCloak,
    kingTorso,
    kingCloak,
    collarWing,
    sculptedCranium,
    sculptedJaw,
    muzzleCyl,
    socketGeo,
    eyeGeo,
    ribTorus,
    vertebraBox,
    armGeo,
    fangCone,
    hornLeft,
    hornRight,
    horseNeck,
    chamfronGeo,
    crownSpike,
    crownBand,
    gemOcta,
    shadowDisc,
  ];

  return {
    pedestalSmall,
    pedestalMed,
    pedestalLarge,
    zombieSwaddle,
    castleKeep,
    castleTurret,
    castleTurretCollar,
    castleSpire,
    castleMainRoof,
    merlonBox,
    bishopRobe,
    warriorPauldron,
    phantomCross,
    staffShaft,
    queenGown,
    queenCloak,
    kingTorso,
    kingCloak,
    collarWing,
    sculptedCranium,
    sculptedJaw,
    muzzleCyl,
    socketGeo,
    eyeGeo,
    ribTorus,
    vertebraBox,
    armGeo,
    fangCone,
    hornLeft,
    hornRight,
    horseNeck,
    chamfronGeo,
    crownSpike,
    crownBand,
    gemOcta,
    shadowDisc,
    dispose: () => {
      allGeos.forEach((g) => g.dispose());
    },
  };
}

export interface PieceRig {
  visualGroup: THREE.Group;
  defaultFacingY: number;
  // Pawn (Bebé Zombi): enormous unhinging jaw + grabbing arms
  pawnUpperHeadPivot?: THREE.Group;
  pawnLowerJawPivot?: THREE.Group;
  pawnMawMesh?: THREE.Mesh;
  pawnLeftArmPivot?: THREE.Group;
  pawnRightArmPivot?: THREE.Group;
  // Bishop: raised crucifix staff + bleeding tip anchor
  bishopStaffPivot?: THREE.Group;
  bishopCrossTip?: THREE.Object3D;
  // Queen (Maléfica): concealed emerging arms & left/right hand orb anchors
  queenLeftArmPivot?: THREE.Group;
  queenRightArmPivot?: THREE.Group;
  queenLeftHandAnchor?: THREE.Object3D;
  queenRightHandAnchor?: THREE.Object3D;
  queenScepterPivot?: THREE.Group;
  // King (Conde Drácula): lunging head + fanged biting jaw
  kingHeadPivot?: THREE.Group;
  kingJawPivot?: THREE.Group;
  // Knight: rearing neck & head
  knightNeckPivot?: THREE.Group;
  // Rook: levitating/crushing castle keep
  rookBodyPivot?: THREE.Group;
}

function addRealisticFace(
  parent: THREE.Group,
  geos: PieceGeometryCache,
  mats: DraculaMaterials,
  fleshMat: THREE.Material,
  eyeMat: THREE.Material,
  headY: number,
  headZ: number,
  scale = 1,
  withFangs = true,
  withCheekbones = false,
) {
  const cranium = new THREE.Mesh(geos.sculptedCranium, fleshMat);
  cranium.position.set(0, headY, headZ);
  cranium.scale.set(0.88 * scale, 1.05 * scale, 0.96 * scale);
  cranium.castShadow = true;
  cranium.receiveShadow = true;
  parent.add(cranium);

  // Brow ridge for anatomical depth
  const brow = new THREE.Mesh(geos.vertebraBox, fleshMat);
  brow.position.set(0, headY + 0.048 * scale, headZ + 0.115 * scale);
  brow.scale.set(2.3 * scale, 0.75 * scale, 0.9 * scale);
  parent.add(brow);

  if (withCheekbones) {
    [-1, 1].forEach((side) => {
      const cheek = new THREE.Mesh(geos.socketGeo, fleshMat);
      cheek.position.set(side * 0.072 * scale, headY - 0.025 * scale, headZ + 0.092 * scale);
      cheek.scale.set(0.85 * scale, 0.65 * scale, 0.7 * scale);
      parent.add(cheek);
    });
  }

  const jaw = new THREE.Mesh(geos.sculptedJaw, fleshMat);
  jaw.position.set(0, headY - 0.1 * scale, headZ + 0.048 * scale);
  jaw.scale.set(scale * 0.82, scale * 0.88, scale * 0.96);
  jaw.castShadow = true;
  parent.add(jaw);

  // Sunken dark eye sockets + piercing realistic irises
  [-1, 1].forEach((side) => {
    const socket = new THREE.Mesh(geos.socketGeo, mats.eyeSocketMat);
    socket.position.set(side * 0.052 * scale, headY + 0.015 * scale, headZ + 0.115 * scale);
    socket.scale.set(1.06 * scale, 0.8 * scale, 0.7 * scale);
    parent.add(socket);

    const iris = new THREE.Mesh(geos.eyeGeo, eyeMat);
    iris.position.set(side * 0.052 * scale, headY + 0.015 * scale, headZ + 0.132 * scale);
    iris.scale.setScalar(scale * 0.85);
    parent.add(iris);

    if (withFangs) {
      const fang = new THREE.Mesh(geos.fangCone, mats.boneMat);
      fang.position.set(side * 0.033 * scale, headY - 0.094 * scale, headZ + 0.114 * scale);
      fang.rotation.x = Math.PI;
      fang.scale.setScalar(scale * 0.92);
      parent.add(fang);
    }
  });
}

export function buildDraculaPieceMesh(
  type: PieceType,
  color: TeamColor,
  geos: PieceGeometryCache,
  mats: DraculaMaterials,
  shadowMap: THREE.Texture,
): THREE.Group {
  const isRed = color === 'w';
  const armorMat = isRed ? mats.redArmorMat : mats.blackArmorMat;
  const fleshMat = isRed ? mats.redFleshMat : mats.blackFleshMat;
  const capeMat = isRed ? mats.redCapeMat : mats.blackCapeMat;
  const stoneMat = isRed ? mats.redStoneMat : mats.blackStoneMat;
  const trimMat = isRed ? mats.redTrimMat : mats.blackTrimMat;
  const hornMat = isRed ? mats.redHornMat : mats.blackHornMat;
  const phantomMat = isRed ? mats.redPhantomMat : mats.blackPhantomMat;
  const eyeMat = isRed ? mats.redEyeMat : mats.blackEyeMat;
  const gemMat = isRed ? mats.redGemMat : mats.blackGemMat;

  const root = new THREE.Group();
  const visualGroup = new THREE.Group();
  const defaultFacingY = isRed ? Math.PI : 0;
  // Red (w) faces -Z toward opponent; Black (b) faces +Z. Locally both face +Z.
  visualGroup.rotation.y = defaultFacingY;
  root.add(visualGroup);

  const rig: PieceRig = {
    visualGroup,
    defaultFacingY,
  };
  root.userData.rig = rig;

  const contactShadow = new THREE.Mesh(
    geos.shadowDisc,
    new THREE.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.userData.isContactShadow = true;
  root.add(contactShadow);

  const shadow = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  if (type === 'p') {
    // PAWN: Hyperrealistic Bebé Zombi with articulated enormous unhinging maw + grabbing arms
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalSmall, trimMat)));

    const swaddle = shadow(new THREE.Mesh(geos.zombieSwaddle, capeMat));
    swaddle.position.set(0, 0.15, -0.01);
    swaddle.rotation.x = 0.08;
    visualGroup.add(swaddle);

    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(geos.ribTorus, mats.boneMat);
      rib.position.set(0, 0.35 + r * 0.056, 0.068);
      rib.rotation.x = Math.PI / 2 - 0.14;
      rib.rotation.z = -Math.PI * 0.08;
      rib.scale.setScalar(0.95 - r * 0.07);
      visualGroup.add(rib);
    }

    for (let v = 0; v < 4; v++) {
      const vert = new THREE.Mesh(geos.vertebraBox, mats.boneMat);
      vert.position.set(0, 0.28 + v * 0.075, -0.175 + v * 0.018);
      vert.rotation.x = 0.25;
      visualGroup.add(vert);
    }

    // Jointed outstretched zombie baby arms (anatomical left = +X, right = -X)
    const buildPawnArm = (side: 1 | -1) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.14, 0.51, 0.02);

      const shoulder = shadow(new THREE.Mesh(geos.socketGeo, fleshMat));
      shoulder.scale.setScalar(0.95);
      armPivot.add(shoulder);

      const arm = shadow(new THREE.Mesh(geos.armGeo, fleshMat));
      arm.position.set(side * 0.03, -0.01, 0.1);
      arm.rotation.x = Math.PI / 2.2;
      arm.rotation.z = -side * 0.14;
      armPivot.add(arm);

      const claw = new THREE.Mesh(geos.fangCone, mats.boneMat);
      claw.position.set(side * 0.05, -0.01, 0.22);
      claw.rotation.x = Math.PI / 2;
      claw.scale.set(1.2, 1.3, 1.2);
      armPivot.add(claw);

      visualGroup.add(armPivot);
      return armPivot;
    };

    rig.pawnLeftArmPivot = buildPawnArm(1);
    rig.pawnRightArmPivot = buildPawnArm(-1);

    // Articulated upper skull & enormous unhinging lower jaw
    const upperHeadPivot = new THREE.Group();
    upperHeadPivot.position.set(0, 0.6, 0.02);
    visualGroup.add(upperHeadPivot);
    rig.pawnUpperHeadPivot = upperHeadPivot;

    const headScale = 0.94;
    const cranium = shadow(new THREE.Mesh(geos.sculptedCranium, fleshMat));
    cranium.position.set(0, 0.07, 0.025);
    cranium.scale.set(0.88 * headScale, 1.02 * headScale, 0.96 * headScale);
    upperHeadPivot.add(cranium);

    const brow = new THREE.Mesh(geos.vertebraBox, fleshMat);
    brow.position.set(0, 0.07 + 0.045, 0.025 + 0.108);
    brow.scale.set(2.15, 0.72, 0.85);
    upperHeadPivot.add(brow);

    [-1, 1].forEach((side) => {
      const cheek = new THREE.Mesh(geos.socketGeo, fleshMat);
      cheek.position.set(side * 0.068, 0.045, 0.112);
      cheek.scale.set(0.8, 0.62, 0.65);
      upperHeadPivot.add(cheek);

      const socket = new THREE.Mesh(geos.socketGeo, mats.eyeSocketMat);
      socket.position.set(side * 0.049, 0.084, 0.132);
      socket.scale.set(1.0, 0.76, 0.66);
      upperHeadPivot.add(socket);

      const iris = new THREE.Mesh(geos.eyeGeo, eyeMat);
      iris.position.set(side * 0.049, 0.084, 0.149);
      iris.scale.setScalar(0.8);
      upperHeadPivot.add(iris);

      // Upper row of zombie fangs
      const fang = new THREE.Mesh(geos.fangCone, mats.boneMat);
      fang.position.set(side * 0.032, -0.015, 0.132);
      fang.rotation.x = Math.PI;
      fang.scale.setScalar(0.95);
      upperHeadPivot.add(fang);
    });

    const tuft = shadow(new THREE.Mesh(geos.sculptedCranium, hornMat));
    tuft.position.set(-0.02, 0.17, -0.04);
    tuft.scale.set(0.68, 0.34, 0.72);
    upperHeadPivot.add(tuft);

    const scar = new THREE.Mesh(geos.merlonBox, armorMat);
    scar.position.set(0.03, 0.16, 0.105);
    scar.scale.set(0.9, 0.18, 0.24);
    scar.rotation.z = 0.28;
    upperHeadPivot.add(scar);

    // Gaping bloody inner maw (hidden at scale 0.01 until pawn opens enormous mouth)
    const mawMesh = new THREE.Mesh(geos.sculptedCranium, mats.mawInnerMat);
    mawMesh.position.set(0, 0.61, 0.08);
    mawMesh.scale.setScalar(0.001);
    visualGroup.add(mawMesh);
    rig.pawnMawMesh = mawMesh;

    // Hinged lower jaw with sharp jagged lower teeth
    const lowerJawPivot = new THREE.Group();
    lowerJawPivot.position.set(0, 0.57, 0.03);
    visualGroup.add(lowerJawPivot);
    rig.pawnLowerJawPivot = lowerJawPivot;

    const jaw = shadow(new THREE.Mesh(geos.sculptedJaw, fleshMat));
    jaw.position.set(0, -0.02, 0.06);
    jaw.scale.set(0.78, 0.78, 0.92);
    lowerJawPivot.add(jaw);

    [-1, 0, 1].forEach((slot) => {
      const lowerTooth = new THREE.Mesh(geos.fangCone, mats.boneMat);
      lowerTooth.position.set(slot * 0.03, 0.025, 0.112);
      lowerTooth.scale.setScalar(slot === 0 ? 0.8 : 1.0);
      lowerJawPivot.add(lowerTooth);
    });
  } else if (type === 'r') {
    // ROOK: Castillo del Conde Drácula
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalMed, trimMat)));

    const rookBodyPivot = new THREE.Group();
    visualGroup.add(rookBodyPivot);
    rig.rookBodyPivot = rookBodyPivot;

    const keep = shadow(new THREE.Mesh(geos.castleKeep, stoneMat));
    keep.position.y = 0.17;
    rookBodyPivot.add(keep);

    for (let m = 0; m < 8; m++) {
      const a = (m / 8) * Math.PI * 2;
      const merlon = shadow(new THREE.Mesh(geos.merlonBox, stoneMat));
      merlon.position.set(Math.cos(a) * 0.23, 1.04, Math.sin(a) * 0.23);
      merlon.rotation.y = -a;
      rookBodyPivot.add(merlon);
    }

    const mainRoof = shadow(new THREE.Mesh(geos.castleMainRoof, armorMat));
    mainRoof.position.y = 1.22;
    rookBodyPivot.add(mainRoof);

    const roofFinial = new THREE.Mesh(geos.gemOcta, gemMat);
    roofFinial.position.y = 1.48;
    roofFinial.scale.set(0.65, 1.4, 0.65);
    rookBodyPivot.add(roofFinial);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const tx = Math.cos(angle) * 0.245;
      const tz = Math.sin(angle) * 0.245;

      const turret = shadow(new THREE.Mesh(geos.castleTurret, stoneMat));
      turret.position.set(tx, 0.56, tz);
      rookBodyPivot.add(turret);

      const collar = shadow(new THREE.Mesh(geos.castleTurretCollar, trimMat));
      collar.position.set(tx, 0.9, tz);
      rookBodyPivot.add(collar);

      const spire = shadow(new THREE.Mesh(geos.castleSpire, armorMat));
      spire.position.set(tx, 1.09, tz);
      rookBodyPivot.add(spire);
    }

    const gate = shadow(new THREE.Mesh(geos.merlonBox, trimMat));
    gate.position.set(0, 0.35, 0.235);
    gate.scale.set(1.5, 2.4, 0.8);
    rookBodyPivot.add(gate);

    [1, -1].forEach((dir) => {
      const lancet = new THREE.Mesh(geos.gemOcta, gemMat);
      lancet.position.set(0, 0.72, dir * 0.225);
      lancet.scale.set(0.6, 1.65, 0.45);
      rookBodyPivot.add(lancet);
    });
  } else if (type === 'n') {
    // KNIGHT: Zombi con Armadura Fantasma with articulated rearing neck
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalMed, trimMat)));

    const knightNeckPivot = new THREE.Group();
    knightNeckPivot.position.set(0, 0.26, -0.02);
    visualGroup.add(knightNeckPivot);
    rig.knightNeckPivot = knightNeckPivot;

    const neck = shadow(new THREE.Mesh(geos.horseNeck, fleshMat));
    neck.position.set(0, 0.24, -0.02);
    neck.rotation.x = 0.28;
    knightNeckPivot.add(neck);

    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(geos.ribTorus, mats.boneMat);
      rib.position.set(0, 0.08 + r * 0.08, 0.07 - r * 0.02);
      rib.rotation.x = Math.PI / 2 + 0.15;
      rib.scale.setScalar(1.08 - r * 0.08);
      knightNeckPivot.add(rib);
    }

    const skull = shadow(new THREE.Mesh(geos.sculptedCranium, fleshMat));
    skull.position.set(0, 0.64, 0.05);
    skull.scale.set(0.78, 0.82, 1.15);
    knightNeckPivot.add(skull);

    const muzzle = shadow(new THREE.Mesh(geos.muzzleCyl, fleshMat));
    muzzle.position.set(0, 0.56, 0.24);
    muzzle.rotation.x = Math.PI / 2 + 0.38;
    knightNeckPivot.add(muzzle);

    const lowerJaw = shadow(new THREE.Mesh(geos.sculptedJaw, fleshMat));
    lowerJaw.position.set(0, 0.46, 0.2);
    lowerJaw.rotation.x = 0.52;
    lowerJaw.scale.set(0.75, 0.52, 1.45);
    knightNeckPivot.add(lowerJaw);

    const chamfron = new THREE.Mesh(geos.chamfronGeo, phantomMat);
    chamfron.position.set(0, 0.61, 0.22);
    chamfron.rotation.x = Math.PI / 2 + 0.36;
    knightNeckPivot.add(chamfron);

    const chestBarding = new THREE.Mesh(geos.chamfronGeo, phantomMat);
    chestBarding.position.set(0, 0.18, 0.11);
    chestBarding.rotation.x = 0.22;
    chestBarding.scale.set(1.45, 0.95, 1.35);
    knightNeckPivot.add(chestBarding);

    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(geos.warriorPauldron, phantomMat);
      pauldron.position.set(side * 0.19, 0.26, 0.04);
      pauldron.rotation.z = -side * 0.45;
      knightNeckPivot.add(pauldron);

      const socket = new THREE.Mesh(geos.socketGeo, mats.eyeSocketMat);
      socket.position.set(side * 0.088, 0.67, 0.13);
      socket.scale.set(0.7, 0.75, 0.9);
      knightNeckPivot.add(socket);

      const eye = new THREE.Mesh(geos.eyeGeo, eyeMat);
      eye.position.set(side * 0.098, 0.67, 0.14);
      eye.scale.setScalar(1.05);
      knightNeckPivot.add(eye);

      const fang = new THREE.Mesh(geos.fangCone, mats.boneMat);
      fang.position.set(side * 0.042, 0.48, 0.35);
      fang.rotation.x = Math.PI + 0.3;
      knightNeckPivot.add(fang);
    });

    for (let s = 0; s < 4; s++) {
      const spike = new THREE.Mesh(geos.crownSpike, phantomMat);
      spike.position.set(0, 0.74 - s * 0.13, -0.09 - s * 0.05);
      spike.rotation.x = -0.68;
      spike.scale.setScalar(1.1);
      knightNeckPivot.add(spike);
    }
  } else if (type === 'b') {
    // BISHOP: Guerrero Fantasmagórico con Cruz Fantasma (articulated crucifix staff)
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalMed, trimMat)));

    const robe = shadow(new THREE.Mesh(geos.bishopRobe, capeMat));
    robe.position.y = 0.17;
    visualGroup.add(robe);

    const cuirass = shadow(new THREE.Mesh(geos.zombieSwaddle, armorMat));
    cuirass.position.y = 0.56;
    cuirass.scale.set(1.04, 1.05, 1.04);
    visualGroup.add(cuirass);

    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(geos.warriorPauldron, phantomMat);
      pauldron.position.set(side * 0.21, 0.9, 0);
      pauldron.rotation.z = -side * 0.42;
      pauldron.scale.setScalar(1.08);
      visualGroup.add(pauldron);
    });

    const cowl = shadow(new THREE.Mesh(geos.sculptedCranium, capeMat));
    cowl.position.set(0, 1.1, -0.02);
    cowl.scale.set(1.14, 1.24, 1.18);
    visualGroup.add(cowl);

    addRealisticFace(visualGroup, geos, mats, mats.eyeSocketMat, eyeMat, 1.07, 0.02, 0.82, false, false);

    // Articulated Crucifix Staff Pivot (lifts up and forward over victim to bleed!)
    const staffPivot = new THREE.Group();
    staffPivot.position.set(0.24, 0.72, 0.06);
    visualGroup.add(staffPivot);
    rig.bishopStaffPivot = staffPivot;

    const staff = new THREE.Mesh(geos.staffShaft, trimMat);
    staff.position.set(0.01, 0.0, 0);
    staff.rotation.z = -0.08;
    staffPivot.add(staff);

    const staffCross = new THREE.Mesh(geos.phantomCross, phantomMat);
    staffCross.position.set(0.05, 0.6, 0);
    staffCross.rotation.z = -0.08;
    staffCross.scale.set(0.95, 1.0, 1.1);
    staffPivot.add(staffCross);

    const crossTip = new THREE.Object3D();
    crossTip.position.set(0.05, 0.56, 0.04);
    staffPivot.add(crossTip);
    rig.bishopCrossTip = crossTip;

    [1, -1].forEach((dir) => {
      const crest = new THREE.Mesh(geos.phantomCross, phantomMat);
      crest.position.set(0, 0.78, dir * 0.195);
      crest.scale.set(0.62, 0.64, 0.7);
      visualGroup.add(crest);
    });
  } else if (type === 'q') {
    // QUEEN: Maléfica con Cuernos Grandes + concealed emerging left & right sorceress hands!
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalLarge, trimMat)));

    const gown = shadow(new THREE.Mesh(geos.queenGown, capeMat));
    gown.position.y = 0.19;
    visualGroup.add(gown);

    const bodice = shadow(new THREE.Mesh(geos.zombieSwaddle, armorMat));
    bodice.position.y = 0.56;
    bodice.scale.set(0.96, 1.12, 0.96);
    visualGroup.add(bodice);

    const cloak = shadow(new THREE.Mesh(geos.queenCloak, capeMat));
    cloak.position.y = 0.72;
    visualGroup.add(cloak);

    [-1, 1].forEach((side) => {
      const wing = shadow(new THREE.Mesh(geos.collarWing, armorMat));
      wing.position.set(side * 0.17, 1.14, -0.08);
      wing.rotation.y = side * 0.42;
      wing.rotation.z = -side * 0.34;
      wing.rotation.x = -0.18;
      visualGroup.add(wing);
    });

    addRealisticFace(visualGroup, geos, mats, fleshMat, eyeMat, 1.18, 0.02, 0.92, false, true);

    const headdress = shadow(new THREE.Mesh(geos.sculptedCranium, hornMat));
    headdress.position.set(0, 1.26, -0.01);
    headdress.scale.set(0.94, 0.88, 0.98);
    visualGroup.add(headdress);

    const hornL = shadow(new THREE.Mesh(geos.hornLeft, hornMat));
    hornL.position.set(0, 1.26, 0);
    visualGroup.add(hornL);

    const hornR = shadow(new THREE.Mesh(geos.hornRight, hornMat));
    hornR.position.set(0, 1.26, 0);
    visualGroup.add(hornR);

    // Concealed emerging arms (anatomical left = +X, anatomical right = -X when facing +Z)
    const buildQueenArm = (side: 1 | -1) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.16, 0.95, 0.04);
      armPivot.scale.setScalar(0.001); // Tucked inside cloak at idle

      const shoulder = shadow(new THREE.Mesh(geos.socketGeo, capeMat));
      shoulder.scale.setScalar(0.95);
      armPivot.add(shoulder);

      const sleeve = shadow(new THREE.Mesh(geos.armGeo, capeMat));
      sleeve.position.set(0, 0, 0.12);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.scale.set(1.25, 1.15, 1.25);
      armPivot.add(sleeve);

      const forearm = shadow(new THREE.Mesh(geos.armGeo, fleshMat));
      forearm.position.set(0, 0, 0.27);
      forearm.rotation.x = Math.PI / 2;
      forearm.scale.set(0.9, 0.85, 0.9);
      armPivot.add(forearm);

      const palm = shadow(new THREE.Mesh(geos.socketGeo, fleshMat));
      palm.position.set(0, 0, 0.37);
      palm.scale.set(0.95, 0.65, 1.1);
      armPivot.add(palm);

      [-0.025, 0, 0.025].forEach((cx) => {
        const finger = new THREE.Mesh(geos.fangCone, hornMat);
        finger.position.set(cx, 0.015, 0.42);
        finger.rotation.x = Math.PI / 2 - 0.35;
        finger.scale.set(0.85, 1.15, 0.85);
        armPivot.add(finger);
      });

      const handAnchor = new THREE.Object3D();
      handAnchor.position.set(0, 0.09, 0.39);
      armPivot.add(handAnchor);

      visualGroup.add(armPivot);
      return { armPivot, handAnchor };
    };

    const leftRig = buildQueenArm(1);
    const rightRig = buildQueenArm(-1);
    rig.queenLeftArmPivot = leftRig.armPivot;
    rig.queenLeftHandAnchor = leftRig.handAnchor;
    rig.queenRightArmPivot = rightRig.armPivot;
    rig.queenRightHandAnchor = rightRig.handAnchor;

    const scepterPivot = new THREE.Group();
    scepterPivot.position.set(0.27, 0.74, 0.08);
    visualGroup.add(scepterPivot);
    rig.queenScepterPivot = scepterPivot;

    const staff = new THREE.Mesh(geos.staffShaft, trimMat);
    scepterPivot.add(staff);

    const scepterGem = new THREE.Mesh(geos.gemOcta, gemMat);
    scepterGem.position.set(0, 0.58, 0);
    scepterGem.scale.setScalar(1.05);
    scepterPivot.add(scepterGem);
  } else {
    // KING: Conde Drácula with articulated head & wide-opening fanged jaw for neck bite
    visualGroup.add(shadow(new THREE.Mesh(geos.pedestalLarge, trimMat)));

    const torso = shadow(new THREE.Mesh(geos.kingTorso, capeMat));
    torso.position.y = 0.19;
    visualGroup.add(torso);

    const chestPlate = shadow(new THREE.Mesh(geos.zombieSwaddle, armorMat));
    chestPlate.position.y = 0.68;
    chestPlate.scale.set(1.14, 1.16, 1.06);
    visualGroup.add(chestPlate);

    const cloak = shadow(new THREE.Mesh(geos.kingCloak, capeMat));
    cloak.position.y = 0.78;
    visualGroup.add(cloak);

    [-1, 1].forEach((side) => {
      const wing = shadow(new THREE.Mesh(geos.collarWing, armorMat));
      wing.position.set(side * 0.21, 1.26, -0.09);
      wing.rotation.y = side * 0.45;
      wing.rotation.z = -side * 0.28;
      wing.rotation.x = -0.2;
      wing.scale.set(1.18, 1.25, 1.0);
      visualGroup.add(wing);

      const pauldron = shadow(new THREE.Mesh(geos.warriorPauldron, armorMat));
      pauldron.position.set(side * 0.24, 1.02, 0);
      pauldron.rotation.z = -side * 0.38;
      visualGroup.add(pauldron);
    });

    const clasp = new THREE.Mesh(geos.gemOcta, gemMat);
    clasp.position.set(0, 1.02, 0.24);
    clasp.scale.set(1.05, 1.3, 0.65);
    visualGroup.add(clasp);

    // Articulated Count Dracula Head & Fanged Jaw
    const kingHeadPivot = new THREE.Group();
    kingHeadPivot.position.set(0, 1.28, 0.03);
    visualGroup.add(kingHeadPivot);
    rig.kingHeadPivot = kingHeadPivot;

    const kScale = 0.98;
    const cranium = shadow(new THREE.Mesh(geos.sculptedCranium, fleshMat));
    cranium.position.set(0, 0.03, 0);
    cranium.scale.set(0.88 * kScale, 1.05 * kScale, 0.96 * kScale);
    kingHeadPivot.add(cranium);

    const brow = new THREE.Mesh(geos.vertebraBox, fleshMat);
    brow.position.set(0, 0.078, 0.112);
    brow.scale.set(2.25, 0.74, 0.88);
    kingHeadPivot.add(brow);

    [-1, 1].forEach((side) => {
      const cheek = new THREE.Mesh(geos.socketGeo, fleshMat);
      cheek.position.set(side * 0.07, 0.005, 0.09);
      cheek.scale.set(0.84, 0.64, 0.68);
      kingHeadPivot.add(cheek);

      const socket = new THREE.Mesh(geos.socketGeo, mats.eyeSocketMat);
      socket.position.set(side * 0.05, 0.045, 0.112);
      socket.scale.set(1.04, 0.78, 0.68);
      kingHeadPivot.add(socket);

      const iris = new THREE.Mesh(geos.eyeGeo, eyeMat);
      iris.position.set(side * 0.05, 0.045, 0.129);
      iris.scale.setScalar(0.84);
      kingHeadPivot.add(iris);

      // Sharp upper vampire fangs
      const fang = new THREE.Mesh(geos.fangCone, mats.boneMat);
      fang.position.set(side * 0.033, -0.064, 0.112);
      fang.rotation.x = Math.PI;
      fang.scale.setScalar(1.02);
      kingHeadPivot.add(fang);
    });

    const kingJawPivot = new THREE.Group();
    kingJawPivot.position.set(0, -0.03, 0.02);
    kingHeadPivot.add(kingJawPivot);
    rig.kingJawPivot = kingJawPivot;

    const jaw = shadow(new THREE.Mesh(geos.sculptedJaw, fleshMat));
    jaw.position.set(0, -0.04, 0.028);
    jaw.scale.set(0.8, 0.84, 0.94);
    kingJawPivot.add(jaw);

    const hair = shadow(new THREE.Mesh(geos.sculptedCranium, hornMat));
    hair.position.set(0, 0.1, -0.01);
    hair.scale.set(0.92, 0.65, 0.94);
    kingHeadPivot.add(hair);

    const crownBand = new THREE.Mesh(geos.crownBand, trimMat);
    crownBand.rotation.x = Math.PI / 2;
    crownBand.scale.setScalar(1.08);
    crownBand.position.set(0, 0.16, 0.02);
    kingHeadPivot.add(crownBand);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(geos.crownSpike, trimMat);
      spike.position.set(Math.cos(a) * 0.12, 0.24, Math.sin(a) * 0.12 + 0.02);
      kingHeadPivot.add(spike);
    }

    const crownGem = new THREE.Mesh(geos.gemOcta, gemMat);
    crownGem.position.set(0, 0.34, 0.02);
    crownGem.scale.set(1.08, 1.35, 1.08);
    kingHeadPivot.add(crownGem);
  }

  return root;
}
