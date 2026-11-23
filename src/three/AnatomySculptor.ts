import * as THREE from 'three';

export interface SculptedAnatomyResult {
  partGroups: Record<string, THREE.Group>;
  animatedRefs: {
    heartGroup?: THREE.Group;
    leftLung?: THREE.Group;
    rightLung?: THREE.Group;
    diaphragm?: THREE.Group;
  };
  materials: {
    nerveMat: THREE.MeshPhysicalMaterial;
    arteryMat: THREE.MeshPhysicalMaterial;
    veinMat: THREE.MeshPhysicalMaterial;
    muscleMat: THREE.MeshPhysicalMaterial;
    tendonMat: THREE.MeshStandardMaterial;
    brainMat: THREE.MeshPhysicalMaterial;
    heartMat: THREE.MeshPhysicalMaterial;
    lungMat: THREE.MeshPhysicalMaterial;
    liverMat: THREE.MeshPhysicalMaterial;
    gallbladderMat: THREE.MeshPhysicalMaterial;
    stomachMat: THREE.MeshPhysicalMaterial;
    kidneyMat: THREE.MeshPhysicalMaterial;
    intestineSmallMat: THREE.MeshPhysicalMaterial;
    intestineLargeMat: THREE.MeshPhysicalMaterial;
    cartilageMat: THREE.MeshStandardMaterial;
  };
  dispose: () => void;
}

function tagPartGroup(group: THREE.Group, partId: string) {
  group.name = partId;
  group.userData.partId = partId;
  group.traverse((obj) => {
    obj.userData.partId = partId;
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

/**
 * Applies smooth organic cortical/surface perturbation to a BufferGeometry
 * using deterministic multi-frequency trigonometry (e.g., brain gyri/sulci, liver/lung contours).
 */
function applyOrganicDisplacement(
  geometry: THREE.BufferGeometry,
  amplitude: number,
  freqX: number,
  freqY: number,
  freqZ: number,
  ridgePower = 1.0
) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  geometry.computeVertexNormals();
  const norm = geometry.attributes.normal;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(norm, i);
    const wave =
      Math.sin(v.x * freqX + v.y * 0.7) *
      Math.cos(v.y * freqY + v.z * 0.6) *
      Math.sin(v.z * freqZ + v.x * 0.5);
    const fold =
      Math.sign(wave) * Math.pow(Math.abs(wave), ridgePower) * amplitude;
    v.addScaledVector(n, fold);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Creates a fusiform muscle belly with tapered tendinous ends along a 3D spline.
 */
function makeMuscleBelly(
  points: [number, number, number][],
  maxRadius: number,
  segments = 20,
  radialSegments = 12,
  material: THREE.Material
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  );
  const geom = new THREE.TubeGeometry(curve, segments, 1.0, radialSegments, false);
  const pos = geom.attributes.position;
  const ringVerts = radialSegments + 1;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    // Fusiform profile: tapered at origin/insertion, full belly near center
    const profile = Math.sin(Math.PI * t);
    const radius = maxRadius * (0.22 + 0.78 * Math.pow(profile, 0.75));
    for (let j = 0; j < ringVerts; j++) {
      const idx = i * ringVerts + j;
      const vx = pos.getX(idx) - center.x;
      const vy = pos.getY(idx) - center.y;
      const vz = pos.getZ(idx) - center.z;
      pos.setXYZ(idx, center.x + vx * radius, center.y + vy * radius, center.z + vz * radius);
    }
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, material);
}

/**
 * Creates a variable-radius organic tube along a 3D spline (used for stomach, intestines, vessels).
 */
function makeVariableTube(
  points: [number, number, number][],
  radiusFn: (t: number) => number,
  segments: number,
  radialSegments: number,
  material: THREE.Material
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  );
  const geom = new THREE.TubeGeometry(curve, segments, 1.0, radialSegments, false);
  const pos = geom.attributes.position;
  const ringVerts = radialSegments + 1;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const r = radiusFn(t);
    for (let j = 0; j < ringVerts; j++) {
      const idx = i * ringVerts + j;
      const vx = pos.getX(idx) - center.x;
      const vy = pos.getY(idx) - center.y;
      const vz = pos.getZ(idx) - center.z;
      pos.setXYZ(idx, center.x + vx * r, center.y + vy * r, center.z + vz * r);
    }
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, material);
}

function makeTubeMesh(
  points: [number, number, number][],
  radius: number,
  segments: number,
  material: THREE.Material,
  radialSegments = 8
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  );
  const geom = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
  return new THREE.Mesh(geom, material);
}

/**
 * Generates an in-memory procedural bump map for organic tissue, striated muscle, and cerebral cortex.
 */
function createTissueBumpTexture(kind: 'brain' | 'muscle' | 'organ'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 128;
        if (kind === 'muscle') {
          // Fine longitudinal myofibril striations
          const fiber = Math.sin(x * 0.72) * 32 + Math.sin(x * 1.45 + y * 0.12) * 14;
          v = 128 + fiber;
        } else if (kind === 'brain') {
          // Micro-vascular & sulcal grain
          const fold = Math.sin(x * 0.25 + Math.cos(y * 0.22) * 2.5) * 34;
          v = 128 + fold;
        } else {
          // Lobular cellular mottling for visceral organs
          const cell =
            Math.sin(x * 0.35) * Math.cos(y * 0.35) * 24 +
            Math.sin((x + y) * 0.55) * 12;
          v = 128 + cell;
        }
        const c = Math.max(0, Math.min(255, Math.round(v)));
        const idx = (y * size + x) * 4;
        d[idx] = c;
        d[idx + 1] = c;
        d[idx + 2] = c;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'muscle' ? 3 : 2, kind === 'muscle' ? 3 : 2);
  return tex;
}

/**
 * Creates a bilateral parent group containing separate anatomical Right (-X),
 * Left (+X), and Midline (0) sub-groups so lateral explosion never crosses the midline.
 */
function createBilateralGroup() {
  const grp = new THREE.Group();
  grp.userData.isBilateral = true;

  const rightGrp = new THREE.Group();
  rightGrp.userData.bilateralSide = -1;

  const leftGrp = new THREE.Group();
  leftGrp.userData.bilateralSide = 1;

  const centerGrp = new THREE.Group();
  centerGrp.userData.bilateralSide = 0;

  grp.add(rightGrp, leftGrp, centerGrp);
  return {
    grp,
    rightGrp,
    leftGrp,
    centerGrp,
    sideGroup: (side: number) => (side < 0 ? rightGrp : leftGrp),
  };
}

export function buildSculptedAnatomy(): SculptedAnatomyResult {
  const partGroups: Record<string, THREE.Group> = {};
  const animatedRefs: SculptedAnatomyResult['animatedRefs'] = {};
  const geometries: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [
    createTissueBumpTexture('brain'),
    createTissueBumpTexture('muscle'),
    createTissueBumpTexture('organ'),
  ];
  const [brainBumpTex, muscleBumpTex, organBumpTex] = textures;

  const trackGeom = <T extends THREE.Group>(grp: T): T => {
    grp.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        geometries.push((child as THREE.Mesh).geometry);
      }
    });
    return grp;
  };

  /* -------------------- REALISTIC PBR CLINICAL MATERIALS -------------------- */
  const brainMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6b8af,
    emissive: 0x3b1818,
    emissiveIntensity: 0.14,
    roughness: 0.4,
    metalness: 0.02,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
    bumpMap: brainBumpTex,
    bumpScale: 0.09,
    transparent: true,
    opacity: 1.0,
  });

  const nerveMat = new THREE.MeshPhysicalMaterial({
    color: 0xfacc15,
    emissive: 0xd97706,
    emissiveIntensity: 0.65,
    roughness: 0.32,
    metalness: 0.12,
    clearcoat: 0.25,
    transparent: true,
    opacity: 1.0,
  });

  const arteryMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.42,
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.5,
    transparent: true,
    opacity: 1.0,
  });

  const veinMat = new THREE.MeshPhysicalMaterial({
    color: 0x2563eb,
    emissive: 0x1e3a8a,
    emissiveIntensity: 0.38,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.45,
    transparent: true,
    opacity: 1.0,
  });

  const muscleMat = new THREE.MeshPhysicalMaterial({
    color: 0x991b1b,
    emissive: 0x450a0a,
    emissiveIntensity: 0.2,
    roughness: 0.48,
    metalness: 0.06,
    clearcoat: 0.28,
    clearcoatRoughness: 0.45,
    bumpMap: muscleBumpTex,
    bumpScale: 0.14,
    transparent: true,
    opacity: 0.88,
  });

  const tendonMat = new THREE.MeshStandardMaterial({
    color: 0xe2dcd0,
    roughness: 0.4,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });

  const heartMat = new THREE.MeshPhysicalMaterial({
    color: 0x9f1239,
    emissive: 0x4c0519,
    emissiveIntensity: 0.3,
    roughness: 0.26,
    metalness: 0.05,
    clearcoat: 0.72,
    clearcoatRoughness: 0.22,
    bumpMap: muscleBumpTex,
    bumpScale: 0.06,
    transparent: true,
    opacity: 1.0,
  });

  const lungMat = new THREE.MeshPhysicalMaterial({
    color: 0xd99b96,
    emissive: 0x3f1d1d,
    emissiveIntensity: 0.14,
    roughness: 0.54,
    metalness: 0.02,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    bumpMap: organBumpTex,
    bumpScale: 0.1,
    transparent: true,
    opacity: 1.0,
  });

  const cartilageMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95,
  });

  const liverMat = new THREE.MeshPhysicalMaterial({
    color: 0x7c2d12,
    emissive: 0x2e1005,
    emissiveIntensity: 0.2,
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.68,
    clearcoatRoughness: 0.24,
    bumpMap: organBumpTex,
    bumpScale: 0.05,
    transparent: true,
    opacity: 1.0,
  });

  const gallbladderMat = new THREE.MeshPhysicalMaterial({
    color: 0x15803d,
    emissive: 0x052e16,
    emissiveIntensity: 0.2,
    roughness: 0.28,
    clearcoat: 0.6,
    transparent: true,
    opacity: 1.0,
  });

  const stomachMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97757,
    emissive: 0x431407,
    emissiveIntensity: 0.18,
    roughness: 0.36,
    clearcoat: 0.45,
    bumpMap: organBumpTex,
    bumpScale: 0.07,
    transparent: true,
    opacity: 1.0,
  });

  const kidneyMat = new THREE.MeshPhysicalMaterial({
    color: 0x881337,
    emissive: 0x310817,
    emissiveIntensity: 0.22,
    roughness: 0.24,
    clearcoat: 0.65,
    bumpMap: organBumpTex,
    bumpScale: 0.06,
    transparent: true,
    opacity: 1.0,
  });

  const intestineSmallMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6a18a,
    emissive: 0x451a12,
    emissiveIntensity: 0.14,
    roughness: 0.38,
    clearcoat: 0.42,
    bumpMap: organBumpTex,
    bumpScale: 0.07,
    transparent: true,
    opacity: 1.0,
  });

  const intestineLargeMat = new THREE.MeshPhysicalMaterial({
    color: 0xc27864,
    emissive: 0x3b1810,
    emissiveIntensity: 0.16,
    roughness: 0.42,
    clearcoat: 0.35,
    bumpMap: organBumpTex,
    bumpScale: 0.08,
    transparent: true,
    opacity: 1.0,
  });

  /* ============================================================================
     1. CEREBRUM (DUAL GYRI/SULCI HEMISPHERES + CORPUS CALLOSUM)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    [-1, 1].forEach((side) => {
      const hemiGeom = new THREE.SphereGeometry(3.2, 32, 26);
      hemiGeom.scale(0.84, 1.15, 1.48);
      applyOrganicDisplacement(hemiGeom, 0.26, 2.3, 2.1, 1.9, 0.85);
      const hemi = new THREE.Mesh(hemiGeom, brainMat);
      hemi.position.set(side * 2.55, 174.4, -1.65);
      hemi.rotation.z = side * -0.06;
      grp.add(hemi);

      // Temporal lobe bulge inferiorly-laterally
      const tempGeom = new THREE.SphereGeometry(1.75, 20, 16);
      tempGeom.scale(0.85, 0.85, 1.45);
      applyOrganicDisplacement(tempGeom, 0.16, 2.6, 2.4, 2.2, 0.9);
      const temporal = new THREE.Mesh(tempGeom, brainMat);
      temporal.position.set(side * 3.4, 171.2, -0.4);
      grp.add(temporal);
    });

    // Corpus Callosum bridge
    const ccGeom = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 12);
    ccGeom.rotateZ(Math.PI / 2);
    ccGeom.scale(1.0, 0.7, 2.0);
    const cc = new THREE.Mesh(ccGeom, tendonMat);
    cc.position.set(0, 173.6, -1.6);
    grp.add(cc);

    tagPartGroup(grp, 'organ_brain_cerebrum');
    partGroups['organ_brain_cerebrum'] = trackGeom(grp);
  }

  /* ============================================================================
     2. CEREBELLUM & BRAINSTEM (PONS + MEDULLA OBLONGATA)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    [-1, 1].forEach((side) => {
      const lobeGeom = new THREE.SphereGeometry(2.1, 24, 18);
      lobeGeom.scale(0.92, 0.78, 0.95);
      applyOrganicDisplacement(lobeGeom, 0.14, 1.2, 5.2, 1.6, 0.75); // horizontal folia
      const lobe = new THREE.Mesh(lobeGeom, brainMat);
      lobe.position.set(side * 1.9, 167.2, -6.3);
      grp.add(lobe);
    });

    // Brainstem (Midbrain -> Pons bulge -> Medulla)
    const stem = makeVariableTube(
      [
        [0, 171.5, -2.6],
        [0, 169.0, -3.5],
        [0, 166.2, -4.6],
        [0, 163.2, -5.5],
      ],
      (t) => (t > 0.25 && t < 0.55 ? 1.28 : 0.82),
      20,
      12,
      tendonMat
    );
    grp.add(stem);

    tagPartGroup(grp, 'organ_brain_cerebellum');
    partGroups['organ_brain_cerebellum'] = trackGeom(grp);
  }

  /* ============================================================================
     3. HUMAN HEART & CORONARY GREAT ROOTS (FLUSH EPICARDIAL VESSELS)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const beatPivot = new THREE.Group();
    beatPivot.position.set(1.55, 133.5, 1.85);

    // Ventricular Cone + Flush Epicardial Coronary Vessels inside same rotated frame
    const ventPivot = new THREE.Group();
    ventPivot.rotation.set(0.2, 0, -0.46);

    const rx = 3.1 * 0.9;
    const ry = 3.1 * 1.28;
    const rz = 3.1 * 0.82;
    const ventGeom = new THREE.SphereGeometry(3.1, 30, 24);
    ventGeom.scale(0.9, 1.28, 0.82);
    const vent = new THREE.Mesh(ventGeom, heartMat);
    ventPivot.add(vent);

    // Helper: projects spherical angles (phi from top, theta around Y) flush onto ventricular surface
    const ventSurf = (phi: number, theta: number, radialMul = 0.99): [number, number, number] => [
      rx * radialMul * Math.sin(phi) * Math.sin(theta),
      ry * radialMul * Math.cos(phi),
      rz * radialMul * Math.sin(phi) * Math.cos(theta),
    ];

    // LAD Coronary Artery descending anterior interventricular sulcus flush on myocardium
    const lad = makeTubeMesh(
      [
        ventSurf(0.55, 0.08, 1.0),
        ventSurf(0.95, 0.14, 1.0),
        ventSurf(1.45, 0.18, 1.0),
        ventSurf(2.05, 0.2, 1.0),
        ventSurf(2.55, 0.15, 0.99),
      ],
      0.13,
      18,
      arteryMat,
      6
    );
    ventPivot.add(lad);

    // Diagonal branch off LAD
    const diagBranch = makeTubeMesh(
      [
        ventSurf(1.15, 0.16, 1.0),
        ventSurf(1.55, 0.55, 1.0),
        ventSurf(1.95, 0.85, 0.99),
      ],
      0.09,
      10,
      arteryMat,
      6
    );
    ventPivot.add(diagBranch);

    // Circumflex (LCx) & Right Coronary Artery (RCA) wrapping coronary sulcus
    const lcx = makeTubeMesh(
      [
        ventSurf(0.55, 0.1, 1.0),
        ventSurf(0.75, 0.78, 1.0),
        ventSurf(0.9, 1.55, 1.0),
        ventSurf(1.05, 2.25, 0.99),
      ],
      0.11,
      14,
      arteryMat,
      6
    );
    ventPivot.add(lcx);

    const rca = makeTubeMesh(
      [
        ventSurf(0.58, -0.15, 1.0),
        ventSurf(0.85, -0.85, 1.0),
        ventSurf(1.15, -1.45, 1.0),
        ventSurf(1.55, -1.85, 0.99),
      ],
      0.12,
      14,
      arteryMat,
      6
    );
    ventPivot.add(rca);

    beatPivot.add(ventPivot);

    // Right & Left Atria + Auricles
    const rAtrium = new THREE.Mesh(new THREE.SphereGeometry(1.72, 18, 16), heartMat);
    rAtrium.position.set(-1.95, 1.85, 0.25);
    beatPivot.add(rAtrium);

    const lAtrium = new THREE.Mesh(new THREE.SphereGeometry(1.58, 18, 16), heartMat);
    lAtrium.position.set(1.25, 2.15, -0.75);
    beatPivot.add(lAtrium);

    // Ascending Aortic Root + Arch + 3 Supra-aortic Branches
    const aortaRoot = makeTubeMesh(
      [
        [0.0, 1.8, 0.2],
        [-0.25, 4.1, 0.35],
        [0.65, 5.8, -0.25],
        [1.35, 5.1, -1.55],
      ],
      0.82,
      18,
      arteryMat,
      10
    );
    beatPivot.add(aortaRoot);

    // Brachiocephalic, Left Common Carotid & Left Subclavian stubs
    [
      { x0: -0.05, y0: 5.1, z0: 0.15, dx: -0.45, dy: 1.45 },
      { x0: 0.45, y0: 5.75, z0: -0.15, dx: 0.1, dy: 1.4 },
      { x0: 0.95, y0: 5.55, z0: -0.55, dx: 0.55, dy: 1.3 },
    ].forEach((b) => {
      beatPivot.add(
        makeTubeMesh(
          [
            [b.x0, b.y0, b.z0],
            [b.x0 + b.dx, b.y0 + b.dy, b.z0 - 0.1],
          ],
          0.26,
          6,
          arteryMat,
          6
        )
      );
    });

    // Pulmonary Trunk Bifurcation
    const pulmTrunk = makeTubeMesh(
      [
        [-0.55, 1.45, 1.15],
        [0.55, 4.05, 0.95],
        [2.05, 4.55, 0.1],
      ],
      0.7,
      14,
      veinMat,
      10
    );
    beatPivot.add(pulmTrunk);

    // Superior & Inferior Vena Cava Entry Stumps
    beatPivot.add(
      makeTubeMesh(
        [
          [-2.05, 2.3, 0.15],
          [-2.15, 5.2, 0.0],
        ],
        0.58,
        8,
        veinMat,
        8
      )
    );

    grp.add(beatPivot);
    animatedRefs.heartGroup = beatPivot;
    tagPartGroup(grp, 'organ_heart');
    partGroups['organ_heart'] = trackGeom(grp);
  }

  /* ============================================================================
     4. BILATERAL LUNGS & CARTILAGINOUS TRACHEA
     ============================================================================ */
  {
    const { grp, rightGrp, leftGrp, centerGrp, sideGroup } = createBilateralGroup();

    // Trachea (Midline)
    const trachea = makeTubeMesh(
      [
        [0, 159.5, -0.6],
        [0, 152.0, -0.9],
        [0, 145.5, -1.1],
      ],
      0.92,
      16,
      cartilageMat,
      12
    );
    centerGrp.add(trachea);

    // Tracheal C-Rings
    for (let y = 146.5; y <= 158.5; y += 1.2) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 6, 16), cartilageMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y, -0.9);
      centerGrp.add(ring);
    }

    // Left & Right Primary Bronchi (attached to their respective lung sub-group)
    [-1, 1].forEach((side) => {
      const bronchus = makeTubeMesh(
        [
          [0, 145.5, -1.1],
          [side * 2.8, 142.8, -1.2],
          [side * 5.2, 140.5, -1.3],
        ],
        0.58,
        10,
        cartilageMat,
        8
      );
      sideGroup(side).add(bronchus);
    });

    // Right Lung (-X, 3-lobed)
    const rLungGrp = new THREE.Group();
    rLungGrp.position.set(-5.6, 136.5, -1.3);
    const rLungGeom = new THREE.SphereGeometry(4.6, 26, 22);
    rLungGeom.scale(0.86, 2.25, 1.15);
    const rPos = rLungGeom.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const x = rPos.getX(i);
      const y = rPos.getY(i);
      const z = rPos.getZ(i);
      const taperTop = y > 0 ? 1 - (y / 12.5) * 0.45 : 1 + (-y / 16) * 0.14;
      const flatBase = y < -8.0 ? -8.0 + (y + 8.0) * 0.18 : y;
      const medialIndent = x > 1.2 ? x * 0.68 : x;
      rPos.setXYZ(i, medialIndent * taperTop, flatBase, z * taperTop);
    }
    rPos.needsUpdate = true;
    applyOrganicDisplacement(rLungGeom, 0.18, 0.9, 1.4, 0.9, 1.0);
    rLungGrp.add(new THREE.Mesh(rLungGeom, lungMat));
    rightGrp.add(rLungGrp);
    animatedRefs.rightLung = rLungGrp;

    // Left Lung (+X, 2-lobed with cardiac notch)
    const lLungGrp = new THREE.Group();
    lLungGrp.position.set(5.8, 137.0, -1.3);
    const lLungGeom = new THREE.SphereGeometry(4.4, 26, 22);
    lLungGeom.scale(0.82, 2.28, 1.12);
    const lPos = lLungGeom.attributes.position;
    for (let i = 0; i < lPos.count; i++) {
      let x = lPos.getX(i);
      const y = lPos.getY(i);
      const z = lPos.getZ(i);
      const taperTop = y > 0 ? 1 - (y / 12.5) * 0.45 : 1 + (-y / 16) * 0.12;
      const flatBase = y < -8.4 ? -8.4 + (y + 8.4) * 0.18 : y;
      if (x < -0.5 && y < 1.5 && z > -1.5) {
        x += 1.45 * Math.exp(-Math.pow((y + 3.2) / 4.0, 2));
      }
      lPos.setXYZ(i, x * taperTop, flatBase, z * taperTop);
    }
    lPos.needsUpdate = true;
    applyOrganicDisplacement(lLungGeom, 0.18, 0.9, 1.4, 0.9, 1.0);
    lLungGrp.add(new THREE.Mesh(lLungGeom, lungMat));
    leftGrp.add(lLungGrp);
    animatedRefs.leftLung = lLungGrp;

    tagPartGroup(grp, 'organ_lungs');
    partGroups['organ_lungs'] = trackGeom(grp);
  }

  /* ============================================================================
     5. THORACIC DIAPHRAGM (MUSCULAR DOME)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const domePivot = new THREE.Group();
    domePivot.position.set(0, 123.5, -1.2);

    const domeGeom = new THREE.SphereGeometry(9.2, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.46);
    domeGeom.scale(1.04, 0.42, 0.68);
    const dPos = domeGeom.attributes.position;
    for (let i = 0; i < dPos.count; i++) {
      const x = dPos.getX(i);
      const y = dPos.getY(i);
      // Right hemidiaphragm (-X) sits ~1.1 cm higher due to liver
      const asymmetricBoost = x < 0 ? 0.65 * Math.exp(-Math.pow((x + 4.5) / 4, 2)) : 0;
      dPos.setY(i, y + asymmetricBoost);
    }
    dPos.needsUpdate = true;
    domeGeom.computeVertexNormals();

    const domeMat = muscleMat.clone();
    domeMat.side = THREE.DoubleSide;
    const domeMesh = new THREE.Mesh(domeGeom, domeMat);
    domePivot.add(domeMesh);

    // Central Tendon Cloverleaf
    const tendonCap = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.8, 0.45, 16),
      tendonMat
    );
    tendonCap.scale.set(1.1, 1.0, 0.72);
    tendonCap.position.set(0, 3.65, 0.2);
    domePivot.add(tendonCap);

    grp.add(domePivot);
    animatedRefs.diaphragm = domePivot;
    tagPartGroup(grp, 'organ_diaphragm');
    partGroups['organ_diaphragm'] = trackGeom(grp);
  }

  /* ============================================================================
     6. LIVER & GALLBLADDER (RIGHT UPPER QUADRANT WEDGE)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const liverGeom = new THREE.SphereGeometry(5.6, 26, 20);
    liverGeom.scale(1.38, 0.74, 0.92);
    const lPos = liverGeom.attributes.position;
    for (let i = 0; i < lPos.count; i++) {
      const x = lPos.getX(i);
      let y = lPos.getY(i);
      const z = lPos.getZ(i);
      // Wedge taper toward anatomical left (+X)
      const wedgeScale = x > 0 ? Math.max(0.25, 1 - x / 9.2) : 1.08;
      // Concave inferior visceral surface
      if (y < 0) y *= 0.65;
      lPos.setXYZ(i, x, y * wedgeScale, z * wedgeScale);
    }
    lPos.needsUpdate = true;
    liverGeom.computeVertexNormals();

    const liverMesh = new THREE.Mesh(liverGeom, liverMat);
    liverMesh.position.set(-3.4, 118.8, 1.4);
    liverMesh.rotation.z = 0.22;
    grp.add(liverMesh);

    // Gallbladder tucked under right inferior hepatic margin
    const gbGeom = new THREE.SphereGeometry(1.15, 16, 14);
    gbGeom.scale(0.85, 1.55, 0.85);
    const gallbladder = new THREE.Mesh(gbGeom, gallbladderMat);
    gallbladder.position.set(-4.6, 114.8, 3.1);
    gallbladder.rotation.z = 0.35;
    gallbladder.rotation.x = 0.4;
    grp.add(gallbladder);

    tagPartGroup(grp, 'organ_liver');
    partGroups['organ_liver'] = trackGeom(grp);
  }

  /* ============================================================================
     7. STOMACH (J-SHAPED GASTRIC CHAMBER)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const stomachMesh = makeVariableTube(
      [
        [1.1, 123.5, 0.4], // Esophageal cardia
        [5.2, 122.2, 0.9], // Gastric fundus dome
        [6.8, 117.5, 2.0], // Greater curvature body
        [4.8, 113.0, 2.5], // Angular incisure
        [1.6, 113.8, 2.1], // Pyloric antrum -> Duodenal bulb
      ],
      (t) => {
        if (t < 0.12) return 0.75 + t * 5.0;
        if (t < 0.65) return 2.45 * Math.sin(t * Math.PI * 0.85) + 0.8;
        return Math.max(0.8, 2.2 * (1 - (t - 0.65) * 1.8));
      },
      28,
      16,
      stomachMat
    );
    grp.add(stomachMesh);

    tagPartGroup(grp, 'organ_stomach');
    partGroups['organ_stomach'] = trackGeom(grp);
  }

  /* ============================================================================
     8. KIDNEYS, ADRENAL GLANDS & URETERS
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const yBase = side === -1 ? 111.2 : 112.6;
      const kGeom = new THREE.SphereGeometry(2.15, 22, 18);
      kGeom.scale(0.85, 1.48, 0.72);
      const kPos = kGeom.attributes.position;
      for (let i = 0; i < kPos.count; i++) {
        let x = kPos.getX(i);
        const y = kPos.getY(i);
        const isMedial = (side === -1 && x > 0.4) || (side === 1 && x < -0.4);
        if (isMedial && Math.abs(y) < 1.6) {
          x *= 0.65;
        }
        kPos.setX(i, x);
      }
      kPos.needsUpdate = true;
      kGeom.computeVertexNormals();

      const kidney = new THREE.Mesh(kGeom, kidneyMat);
      kidney.position.set(side * 4.5, yBase, -3.6);
      kidney.rotation.z = side * -0.14;
      target.add(kidney);

      const adrenal = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 10), nerveMat);
      adrenal.position.set(side * 4.1, yBase + 3.4, -3.5);
      adrenal.rotation.z = side * 0.2;
      target.add(adrenal);

      const ureter = makeTubeMesh(
        [
          [side * 3.4, yBase - 0.3, -3.3],
          [side * 3.1, 103.0, -2.6],
          [side * 2.4, 94.0, -0.5],
        ],
        0.22,
        14,
        tendonMat,
        6
      );
      target.add(ureter);
    });

    tagPartGroup(grp, 'organ_kidneys');
    partGroups['organ_kidneys'] = trackGeom(grp);
  }

  /* ============================================================================
     9. SMALL & LARGE INTESTINES (HAUSTRATED COLON + SMOOTH 48-PT JEJUNAL/ILEAL COIL)
     ============================================================================ */
  {
    const grp = new THREE.Group();

    const colon = makeVariableTube(
      [
        [-6.0, 96.5, 1.4],
        [-6.6, 103.5, 1.2],
        [-5.8, 109.8, 2.2],
        [0.0, 109.2, 3.4],
        [6.2, 111.2, 1.8],
        [6.5, 103.0, 1.0],
        [4.8, 95.8, 1.2],
        [0.2, 93.2, -1.6],
      ],
      (t) => 1.35 + 0.22 * Math.sin(t * Math.PI * 36),
      72,
      12,
      intestineLargeMat
    );
    grp.add(colon);

    // Smooth 48-point organic small-intestine coil nested inside colon frame
    const smallPts: [number, number, number][] = [];
    const totalPts = 48;
    for (let i = 0; i < totalPts; i++) {
      const t = i / (totalPts - 1);
      const y = 109.6 - t * 13.0;
      const x = Math.sin(t * Math.PI * 7.5) * (3.7 - Math.abs(t - 0.5) * 1.1);
      const z = 1.65 + Math.cos(t * Math.PI * 15) * 0.75 + Math.sin(t * Math.PI) * 0.65;
      smallPts.push([x, y, z]);
    }
    smallPts.push([-4.9, 96.6, 1.4]); // Ileocecal termination
    const smallInt = makeTubeMesh(smallPts, 0.88, 120, intestineSmallMat, 10);
    grp.add(smallInt);

    tagPartGroup(grp, 'organ_intestines');
    partGroups['organ_intestines'] = trackGeom(grp);
  }

  /* ============================================================================
     9B. BILATERAL OCULAR GLOBES, IRIS & OPTIC NERVES
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const ex = side * 3.15;
      const ey = 171.6;
      const ez = 4.55;

      const sclera = new THREE.Mesh(
        new THREE.SphereGeometry(1.12, 20, 16),
        tendonMat
      );
      sclera.position.set(ex, ey, ez);
      target.add(sclera);

      const irisDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.52, 0.22, 16),
        veinMat
      );
      irisDisc.rotation.x = Math.PI / 2;
      irisDisc.position.set(ex, ey, ez + 0.98);
      target.add(irisDisc);

      const opticStem = makeTubeMesh(
        [
          [ex, ey, ez - 0.95],
          [ex * 0.65, ey - 0.2, ez - 2.35],
        ],
        0.22,
        8,
        nerveMat,
        6
      );
      target.add(opticStem);
    });

    tagPartGroup(grp, 'organ_eyes');
    partGroups['organ_eyes'] = trackGeom(grp);
  }

  /* ============================================================================
     9C. LARYNX & VOCAL APPARATUS
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.25, 3.8, 16),
      cartilageMat
    );
    shield.scale.set(1.05, 1.0, 0.92);
    shield.position.set(0, 160.8, 0.8);
    grp.add(shield);

    const epiglottis = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 10),
      stomachMat
    );
    epiglottis.scale.set(1.05, 1.25, 0.35);
    epiglottis.position.set(0, 162.8, 1.15);
    grp.add(epiglottis);

    tagPartGroup(grp, 'organ_larynx');
    partGroups['organ_larynx'] = trackGeom(grp);
  }

  /* ============================================================================
     9D. ESOPHAGUS (POSTERIOR THORACIC MUSCULAR CONDUIT)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const esophTube = makeTubeMesh(
      [
        [0.0, 158.0, -2.1],
        [0.15, 148.5, -2.8],
        [0.45, 138.0, -3.2],
        [0.85, 124.2, -1.4],
      ],
      0.68,
      24,
      stomachMat,
      10
    );
    grp.add(esophTube);

    tagPartGroup(grp, 'organ_esophagus');
    partGroups['organ_esophagus'] = trackGeom(grp);
  }

  /* ============================================================================
     9E. PANCREAS (RETROPERITONEAL HEAD, BODY & TAIL)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const pancMesh = makeVariableTube(
      [
        [-1.35, 112.2, -0.5],
        [0.45, 113.4, -1.2],
        [3.1, 114.6, -2.0],
        [5.6, 115.8, -2.6],
      ],
      (t) => 1.55 * (1 - 0.52 * t),
      22,
      12,
      nerveMat
    );
    grp.add(pancMesh);

    tagPartGroup(grp, 'organ_pancreas');
    partGroups['organ_pancreas'] = trackGeom(grp);
  }

  /* ============================================================================
     9F. SPLEEN (LEFT HYPOCHONDRIUM LYMPHOID ORGAN)
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const spleenMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 20, 16),
      kidneyMat
    );
    spleenMesh.scale.set(0.74, 1.42, 0.95);
    spleenMesh.position.set(7.6, 117.2, -1.6);
    spleenMesh.rotation.z = -0.35;
    grp.add(spleenMesh);

    tagPartGroup(grp, 'organ_spleen');
    partGroups['organ_spleen'] = trackGeom(grp);
  }

  /* ============================================================================
     9G. URINARY BLADDER & PELVIC OUTLET
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const bladderDome = new THREE.Mesh(
      new THREE.SphereGeometry(2.05, 18, 16),
      stomachMat
    );
    bladderDome.scale.set(1.06, 0.9, 1.08);
    bladderDome.position.set(0, 91.5, 3.0);
    grp.add(bladderDome);

    tagPartGroup(grp, 'organ_bladder');
    partGroups['organ_bladder'] = trackGeom(grp);
  }

  /* ============================================================================
     10. SPINAL CORD & INTERCOSTAL NERVE ROOTS
     ============================================================================ */
  {
    const grp = new THREE.Group();
    const cord = makeVariableTube(
      [
        [0, 163.2, -5.5],
        [0, 148.0, -5.8],
        [0, 134.0, -6.5],
        [0, 120.0, -5.6],
        [0, 109.5, -5.2], // Conus Medullaris (L1-L2)
        [0, 96.0, -4.8], // Cauda Equina
      ],
      (t) => (t < 0.78 ? 0.62 : 0.35),
      36,
      10,
      nerveMat
    );
    grp.add(cord);

    // 12 Pairs of Thoracic Intercostal Nerves
    for (let i = 0; i < 12; i++) {
      const y = 149.0 - i * 2.45;
      [-1, 1].forEach((side) => {
        const icNerve = makeTubeMesh(
          [
            [0, y, -5.8],
            [side * 5.2, y - 0.5, -4.5],
            [side * 9.8, y - 1.2, -1.0],
            [side * 5.2, y - 1.8, 4.2],
          ],
          0.16,
          12,
          nerveMat,
          6
        );
        grp.add(icNerve);
      });
    }

    tagPartGroup(grp, 'nerve_spinal_cord');
    partGroups['nerve_spinal_cord'] = trackGeom(grp);
  }

  /* ============================================================================
     11. BRACHIAL PLEXUS & UPPER LIMB NERVES (ALIGNED TO TRUE GLB ARM BONES)
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      // Median + Ulnar + Radial main brachial path hugging glenoid -> humerus -> elbow -> forearm -> carpus
      const median = makeTubeMesh(
        [
          [side * 2.2, 152.5, -5.0],
          [side * 10.6, 144.8, -5.6],
          [side * 17.5, 140.2, -5.8],
          [side * 20.4, 133.8, -5.4],
          [side * 24.2, 120.2, -4.8],
          [side * 27.6, 106.8, -3.5],
          [side * 30.8, 86.0, 0.2],
        ],
        0.26,
        32,
        nerveMat,
        7
      );
      target.add(median);

      const radial = makeTubeMesh(
        [
          [side * 10.6, 144.5, -6.2],
          [side * 17.8, 140.0, -6.6],
          [side * 21.0, 134.2, -7.0],
          [side * 24.4, 120.5, -5.0],
          [side * 28.4, 107.0, -4.4],
          [side * 31.3, 88.2, -0.4],
        ],
        0.2,
        28,
        nerveMat,
        6
      );
      target.add(radial);

      [-0.8, 0, 0.8].forEach((dz) => {
        const digit = makeTubeMesh(
          [
            [side * 30.8, 86.0, 0.2],
            [side * 31.4, 81.2, 0.2 + dz * 1.8],
          ],
          0.11,
          6,
          nerveMat,
          5
        );
        target.add(digit);
      });
    });

    tagPartGroup(grp, 'nerve_brachial_plexus');
    partGroups['nerve_brachial_plexus'] = trackGeom(grp);
  }

  /* ============================================================================
     12. SCIATIC & FEMORAL NERVE TRUNKS (ALIGNED TO TRUE GLB LEG BONES)
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const sciatic = makeTubeMesh(
        [
          [side * 3.8, 97.5, -4.8],
          [side * 8.6, 86.5, -5.2],
          [side * 9.8, 72.0, -4.6],
          [side * 8.4, 52.0, -4.2],
          [side * 7.2, 28.0, -5.2],
          [side * 7.8, 4.5, -1.0],
        ],
        0.46,
        32,
        nerveMat,
        8
      );
      target.add(sciatic);

      const fibular = makeTubeMesh(
        [
          [side * 8.4, 52.0, -4.2],
          [side * 9.8, 42.0, -3.4],
          [side * 8.4, 24.0, -2.5],
          [side * 8.2, 5.2, 3.2],
        ],
        0.24,
        18,
        nerveMat,
        6
      );
      target.add(fibular);

      const femoral = makeTubeMesh(
        [
          [side * 3.2, 104.0, -3.5],
          [side * 8.2, 90.0, 0.8],
          [side * 9.8, 72.0, 0.4],
          [side * 8.4, 54.0, 0.2],
        ],
        0.28,
        18,
        nerveMat,
        6
      );
      target.add(femoral);
    });

    tagPartGroup(grp, 'nerve_sciatic_femoral');
    partGroups['nerve_sciatic_femoral'] = trackGeom(grp);
  }

  /* ============================================================================
     13. CAROTID & JUGULAR NEUROVASCULAR AXIS
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const carotid = makeTubeMesh(
        [
          [side * 1.2, 146.5, 0.5],
          [side * 2.9, 155.0, 0.2],
          [side * 3.3, 164.0, 0.1],
          [side * 2.5, 171.5, -0.8],
        ],
        0.42,
        18,
        arteryMat,
        8
      );
      target.add(carotid);

      const jugular = makeTubeMesh(
        [
          [side * 2.2, 147.0, 0.9],
          [side * 3.8, 155.0, 0.5],
          [side * 4.1, 164.5, 0.0],
          [side * 3.4, 170.5, -1.6],
        ],
        0.52,
        18,
        veinMat,
        8
      );
      target.add(jugular);
    });

    tagPartGroup(grp, 'vascular_carotid_jugular');
    partGroups['vascular_carotid_jugular'] = trackGeom(grp);
  }

  /* ============================================================================
     14. AORTA & VENA CAVA SYSTEMIC TRUNKS
     ============================================================================ */
  {
    const grp = new THREE.Group();
    // Thoracic & Abdominal Aorta + Iliac Bifurcation
    const aorta = makeTubeMesh(
      [
        [1.2, 138.0, 1.4],
        [0.4, 145.5, 1.0],
        [-0.4, 147.0, -0.6],
        [-0.7, 139.0, -2.5],
        [-0.5, 122.0, -2.6],
        [-0.3, 104.0, -2.0],
      ],
      0.88,
      36,
      arteryMat,
      10
    );
    grp.add(aorta);

    // Superior & Inferior Vena Cava
    const svc = makeTubeMesh(
      [
        [-1.8, 150.5, 0.6],
        [-1.6, 143.0, 1.0],
        [-1.4, 136.0, 1.3],
      ],
      0.92,
      16,
      veinMat,
      10
    );
    grp.add(svc);

    const ivc = makeTubeMesh(
      [
        [-1.4, 131.5, 0.8],
        [-1.6, 121.0, -0.8],
        [-1.4, 104.0, -1.4],
      ],
      0.96,
      24,
      veinMat,
      10
    );
    grp.add(ivc);

    // Bilateral Renal Arteries & Veins
    [-1, 1].forEach((side) => {
      grp.add(
        makeTubeMesh(
          [
            [-0.4, 113.0, -2.3],
            [side * 3.8, 112.0, -3.4],
          ],
          0.32,
          8,
          arteryMat,
          6
        )
      );
      grp.add(
        makeTubeMesh(
          [
            [-1.5, 112.8, -1.2],
            [side * 3.8, 111.8, -3.2],
          ],
          0.36,
          8,
          veinMat,
          6
        )
      );
    });

    tagPartGroup(grp, 'vascular_aorta_vena_cava');
    partGroups['vascular_aorta_vena_cava'] = trackGeom(grp);
  }

  /* ============================================================================
     15. UPPER LIMB VASCULAR TREE
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const armArt = makeTubeMesh(
        [
          [side * 1.4, 146.5, -0.6],
          [side * 10.6, 144.2, -4.8],
          [side * 17.2, 139.5, -5.2],
          [side * 19.6, 133.8, -4.8],
          [side * 24.0, 120.2, -3.6],
          [side * 27.0, 106.8, -2.8],
          [side * 30.4, 86.2, 0.5],
        ],
        0.34,
        32,
        arteryMat,
        7
      );
      target.add(armArt);

      const ulnarArt = makeTubeMesh(
        [
          [side * 24.0, 120.2, -3.6],
          [side * 27.8, 106.2, -4.2],
          [side * 31.0, 86.2, -0.2],
        ],
        0.24,
        16,
        arteryMat,
        6
      );
      target.add(ulnarArt);

      const armVein = makeTubeMesh(
        [
          [side * 2.0, 147.2, 0.2],
          [side * 11.2, 144.8, -4.0],
          [side * 18.0, 140.0, -4.4],
          [side * 20.4, 134.0, -4.0],
          [side * 24.8, 120.4, -2.8],
          [side * 28.0, 106.8, -2.0],
          [side * 31.2, 86.2, 0.8],
        ],
        0.38,
        32,
        veinMat,
        7
      );
      target.add(armVein);
    });

    tagPartGroup(grp, 'vascular_upper_limb');
    partGroups['vascular_upper_limb'] = trackGeom(grp);
  }

  /* ============================================================================
     16. LOWER LIMB VASCULAR TREE
     ============================================================================ */
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const legArt = makeTubeMesh(
        [
          [side * 0.8, 104.0, -2.0],
          [side * 5.8, 96.5, -0.6],
          [side * 8.6, 85.0, 0.4],
          [side * 9.0, 72.0, -1.2],
          [side * 7.6, 51.0, -3.2],
          [side * 7.0, 28.0, -3.4],
          [side * 8.2, 5.2, 2.2],
        ],
        0.44,
        34,
        arteryMat,
        8
      );
      target.add(legArt);

      const legVein = makeTubeMesh(
        [
          [side * 1.4, 104.0, -1.4],
          [side * 4.8, 96.5, 0.2],
          [side * 7.8, 85.0, 1.0],
          [side * 8.2, 72.0, -0.4],
          [side * 6.8, 51.0, -2.2],
          [side * 6.4, 28.0, -2.5],
          [side * 7.4, 5.2, 2.6],
        ],
        0.48,
        34,
        veinMat,
        8
      );
      target.add(legVein);
    });

    tagPartGroup(grp, 'vascular_lower_limb');
    partGroups['vascular_lower_limb'] = trackGeom(grp);
  }

  /* ============================================================================
     17. MUSCULAR GROUPS (SCULPTED FUSIFORM MUSCLE BELLIES + TENDONS)
     ============================================================================ */
  // 17A. Head & Neck Muscles
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      target.add(
        makeMuscleBelly(
          [
            [side * 5.0, 165.2, -3.6],
            [side * 3.8, 158.0, -0.8],
            [side * 1.4, 151.0, 2.0],
          ],
          1.35,
          16,
          10,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 5.2, 168.0, 1.5],
            [side * 5.3, 165.0, 1.8],
            [side * 4.8, 162.5, 1.2],
          ],
          1.4,
          12,
          10,
          muscleMat
        )
      );
      const temp = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 12), muscleMat);
      temp.scale.set(0.35, 1.1, 1.25);
      temp.position.set(side * 6.3, 173.2, -0.5);
      target.add(temp);
    });

    tagPartGroup(grp, 'muscle_head_neck');
    partGroups['muscle_head_neck'] = trackGeom(grp);
  }

  // 17B. Thoracic & Core Muscles (Pectoralis Major + Rectus Abdominis + Obliques)
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      target.add(
        makeMuscleBelly(
          [
            [side * 1.4, 144.0, 4.4],
            [side * 7.8, 140.5, 5.2],
            [side * 17.5, 138.0, -2.5],
          ],
          2.6,
          18,
          12,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 1.4, 136.5, 5.4],
            [side * 7.5, 136.0, 5.6],
            [side * 17.2, 137.2, -2.5],
          ],
          2.5,
          18,
          12,
          muscleMat
        )
      );

      for (let row = 0; row < 4; row++) {
        const y = 123.5 - row * 5.6;
        const pack = new THREE.Mesh(new THREE.SphereGeometry(2.3, 14, 12), muscleMat);
        pack.scale.set(1.05, 1.15, 0.45);
        pack.position.set(side * 2.6, y, 4.8 - row * 0.25);
        target.add(pack);
      }

      target.add(
        makeMuscleBelly(
          [
            [side * 10.4, 128.0, 1.0],
            [side * 10.0, 115.0, 2.2],
            [side * 8.2, 102.0, 2.4],
          ],
          2.1,
          18,
          10,
          muscleMat
        )
      );
    });

    tagPartGroup(grp, 'muscle_pectoralis_core');
    partGroups['muscle_pectoralis_core'] = trackGeom(grp);
  }

  // 17C. Upper Limb Muscles (Deltoid, Biceps, Triceps, Forearm Flexors)
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      target.add(
        makeMuscleBelly(
          [
            [side * 14.2, 146.2, -5.8],
            [side * 19.6, 142.0, -5.8],
            [side * 20.4, 134.5, -6.2],
          ],
          2.8,
          16,
          12,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 18.2, 141.0, -4.6],
            [side * 20.6, 132.5, -3.4],
            [side * 23.2, 121.0, -4.0],
          ],
          2.25,
          18,
          12,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 18.8, 140.5, -7.8],
            [side * 21.0, 132.5, -8.5],
            [side * 23.4, 121.0, -6.6],
          ],
          2.35,
          18,
          12,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 23.8, 120.0, -4.4],
            [side * 27.6, 111.0, -3.2],
            [side * 29.8, 95.5, -1.6],
          ],
          2.05,
          18,
          12,
          muscleMat
        )
      );
    });

    tagPartGroup(grp, 'muscle_upper_limb');
    partGroups['muscle_upper_limb'] = trackGeom(grp);
  }

  // 17D. Lower Limb Muscles (Gluteus, Quadriceps, Hamstrings, Calves & Achilles Tendon)
  {
    const { grp, sideGroup } = createBilateralGroup();
    [-1, 1].forEach((side) => {
      const target = sideGroup(side);
      const glute = new THREE.Mesh(new THREE.SphereGeometry(4.4, 16, 14), muscleMat);
      glute.scale.set(1.05, 1.32, 0.72);
      glute.position.set(side * 6.8, 92.0, -7.4);
      target.add(glute);

      target.add(
        makeMuscleBelly(
          [
            [side * 9.5, 92.0, 1.2],
            [side * 10.2, 74.5, 1.6],
            [side * 9.4, 54.5, 1.4],
          ],
          3.45,
          20,
          14,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 8.4, 89.0, -5.8],
            [side * 9.6, 73.0, -6.0],
            [side * 8.8, 54.0, -5.4],
          ],
          3.0,
          20,
          12,
          muscleMat
        )
      );
      target.add(
        makeMuscleBelly(
          [
            [side * 7.8, 50.0, -5.8],
            [side * 7.4, 36.5, -7.2],
            [side * 7.2, 21.0, -6.8],
          ],
          2.8,
          18,
          12,
          muscleMat
        )
      );
      target.add(
        makeTubeMesh(
          [
            [side * 7.2, 22.0, -6.8],
            [side * 7.6, 12.0, -7.4],
            [side * 8.0, 4.2, -7.8],
          ],
          0.75,
          12,
          tendonMat,
          8
        )
      );
    });

    tagPartGroup(grp, 'muscle_lower_limb');
    partGroups['muscle_lower_limb'] = trackGeom(grp);
  }

  return {
    partGroups,
    animatedRefs,
    materials: {
      nerveMat,
      arteryMat,
      veinMat,
      muscleMat,
      tendonMat,
      brainMat,
      heartMat,
      lungMat,
      liverMat,
      gallbladderMat,
      stomachMat,
      kidneyMat,
      intestineSmallMat,
      intestineLargeMat,
      cartilageMat,
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      [
        nerveMat,
        arteryMat,
        veinMat,
        muscleMat,
        tendonMat,
        brainMat,
        heartMat,
        lungMat,
        liverMat,
        gallbladderMat,
        stomachMat,
        kidneyMat,
        intestineSmallMat,
        intestineLargeMat,
        cartilageMat,
      ].forEach((m) => m.dispose());
    },
  };
}
