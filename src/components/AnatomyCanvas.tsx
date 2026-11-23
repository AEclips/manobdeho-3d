import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ANATOMY_PARTS,
  CHAPTERS,
  PARTS_BY_ID,
  SYSTEM_MAP,
} from '../data/anatomyDatabase';
import { buildSculptedAnatomy, SculptedAnatomyResult } from '../three/AnatomySculptor';
import {
  createDracoGltfLoader,
  createMicroBumpTexture,
  ensureBoxUVs,
  HD_PART_CONFIGS,
  HD_PART_IDS,
  HdPartStatus,
  loadHdPartScene,
  mirrorObjectGeometryX,
  upgradeHdOrganMaterial,
} from '../three/HighPolyAssetManager';
import { Ktx2PbrTextureSet, loadKtx2PbrTextures } from '../three/Ktx2PbrManager';
import {
  CameraPreset,
  DissectionMode,
  ImagingMode,
  SliceConfig,
  SystemId,
} from '../types/anatomy';

interface LayerState {
  active: boolean;
  opacity: number;
}

interface AnatomyCanvasProps {
  scrollProgress: number;
  activeChapter: number;
  dissectionMode: DissectionMode;
  imagingMode: ImagingMode;
  layerStates: Record<SystemId, LayerState>;
  selectedPartId: string | null;
  isolatedPartId: string | null;
  isolationGhostContext: boolean;
  freeOrbit: boolean;
  autoSpin: boolean;
  showPins: boolean;
  isPlaying: boolean;
  cinemaMode: boolean;
  heartRateBpm: number;
  sliceConfig: SliceConfig;
  cameraPreset: CameraPreset;
  cameraPresetTick: number;
  zoomCommand: { delta: number; tick: number } | null;
  preloadAllHdTick: number;
  onSelectPart: (partId: string | null) => void;
  onIsolatePart: (partId: string) => void;
  onModelReady: (loadedCount: number) => void;
  onModelError: (errMsg: string) => void;
  onHdStatusChange: (partId: string, status: HdPartStatus) => void;
  onKtx2Ready?: (ready: boolean) => void;
}

interface PinScreenPos {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export const AnatomyCanvas: React.FC<AnatomyCanvasProps> = ({
  scrollProgress,
  activeChapter,
  dissectionMode,
  imagingMode,
  layerStates,
  selectedPartId,
  isolatedPartId,
  isolationGhostContext,
  freeOrbit,
  autoSpin,
  showPins,
  isPlaying,
  cinemaMode,
  heartRateBpm,
  sliceConfig,
  cameraPreset,
  cameraPresetTick,
  zoomCommand,
  preloadAllHdTick,
  onSelectPart,
  onIsolatePart,
  onModelReady,
  onModelError,
  onHdStatusChange,
  onKtx2Ready,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pinsRef = useRef<HTMLDivElement | null>(null);
  const hdTriggerRef = useRef<((partId: string) => Promise<void>) | null>(null);
  const onHdStatusChangeRef = useRef(onHdStatusChange);
  onHdStatusChangeRef.current = onHdStatusChange;
  const onKtx2ReadyRef = useRef(onKtx2Ready);
  onKtx2ReadyRef.current = onKtx2Ready;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverScreenPos, setHoverScreenPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // Mutable ref holding latest React props so RAF loop stays stale-closure-free
  const propsRef = useRef({
    scrollProgress,
    activeChapter,
    dissectionMode,
    imagingMode,
    layerStates,
    selectedPartId,
    isolatedPartId,
    isolationGhostContext,
    freeOrbit,
    autoSpin,
    showPins,
    isPlaying,
    cinemaMode,
    heartRateBpm,
    sliceConfig,
    cameraPreset,
    cameraPresetTick,
    zoomCommand,
    hoveredId,
    onSelectPart,
    onIsolatePart,
  });

  propsRef.current = {
    scrollProgress,
    activeChapter,
    dissectionMode,
    imagingMode,
    layerStates,
    selectedPartId,
    isolatedPartId,
    isolationGhostContext,
    freeOrbit,
    autoSpin,
    showPins,
    isPlaying,
    cinemaMode,
    heartRateBpm,
    sliceConfig,
    cameraPreset,
    cameraPresetTick,
    zoomCommand,
    hoveredId,
    onSelectPart,
    onIsolatePart,
  };

  // Track isolation transitions to smoothly snap camera once upon entering/exiting isolation
  const prevIsolatedRef = useRef<string | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    /* -------------------- 1. RENDERER, SCENE, CAMERA -------------------- */
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060b16, 0.018);

    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.08,
      60
    );
    camera.position.set(0, -0.04, 5.55);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    // Subtle studio PBR environment reflections for smooth cortical bone & organ contours
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const studioEnv = new RoomEnvironment();
    const envRenderTarget = pmremGenerator.fromScene(studioEnv, 0.04);
    studioEnv.dispose();
    scene.environment = envRenderTarget.texture;
    scene.environmentIntensity = 0.5;

    const boneMicroTex = createMicroBumpTexture('bone');
    const organMicroTex = createMicroBumpTexture('organ');
    let ktx2Set: Ktx2PbrTextureSet | null = null;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.minDistance = 0.35;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.enabled = false;

    /* -------------------- 2. STUDIO SURGICAL LIGHTING -------------------- */
    const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x0b1120, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    keyLight.position.set(4.5, 6.0, 5.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimCyan = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimCyan.position.set(-4.5, 3.0, -3.5);
    scene.add(rimCyan);

    const rimWarm = new THREE.DirectionalLight(0xf43f5e, 0.45);
    rimWarm.position.set(3.5, -1.5, -3.0);
    scene.add(rimWarm);

    const underFill = new THREE.DirectionalLight(0x94a3b8, 0.45);
    underFill.position.set(0, -4, 3);
    scene.add(underFill);

    // Subtle Clinical Measurement Platform Grid under feet
    const platformGroup = new THREE.Group();
    platformGroup.position.set(0, -1.85, 0);
    const gridHelper = new THREE.GridHelper(4.8, 24, 0x1e3a5f, 0x0f172a);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.45;
    platformGroup.add(gridHelper);

    const ringGeom = new THREE.RingGeometry(0.95, 0.98, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.005;
    platformGroup.add(ringMesh);
    scene.add(platformGroup);

    /* -------------------- 3. ANATOMICAL ROOT & MATERIALS -------------------- */
    const anatomicalRoot = new THREE.Group();
    anatomicalRoot.scale.set(0.02, 0.02, 0.02);
    const initialHeroX =
      window.innerWidth >= 1024 ? 0.42 : window.innerWidth >= 768 ? 0.25 : 0;
    anatomicalRoot.position.set(initialHeroX, -1.86, 0);
    scene.add(anatomicalRoot);

    /* -------------------- REAL-TIME MRI CROSS-SECTION CLIPPING -------------------- */
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const applyClipState = (mat: THREE.Material, enabled: boolean) => {
      const currentlyEnabled = Boolean(mat.clippingPlanes && mat.clippingPlanes.length > 0);
      if (currentlyEnabled !== enabled) {
        mat.clippingPlanes = enabled ? [clipPlane] : null;
        mat.clipShadows = enabled;
        mat.needsUpdate = true;
      }
    };

    const sliceHelperGroup = new THREE.Group();
    const sliceFillGeom = new THREE.PlaneGeometry(1, 1);
    const sliceFillMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sliceFillMesh = new THREE.Mesh(sliceFillGeom, sliceFillMat);
    const sliceEdgeGeom = new THREE.EdgesGeometry(sliceFillGeom);
    const sliceEdgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
    });
    const sliceEdgeLines = new THREE.LineSegments(sliceEdgeGeom, sliceEdgeMat);
    sliceHelperGroup.add(sliceFillMesh);
    sliceHelperGroup.add(sliceEdgeLines);
    sliceHelperGroup.visible = false;
    anatomicalRoot.add(sliceHelperGroup);

    const bodyLocalBox = new THREE.Box3(
      new THREE.Vector3(-36, 2, -16),
      new THREE.Vector3(36, 176, 16)
    );

    const boneBaseMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1ebe0,
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.52,
      bumpMap: boneMicroTex,
      bumpScale: 0.012,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });

    const skinShellMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.22,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Build sculpted organic organs, muscles, nerves, and vessels
    const sculpted: SculptedAnatomyResult = buildSculptedAnatomy();
    const allPartGroups: Record<string, THREE.Group> = {
      ...sculpted.partGroups,
    };
    const restLocalBoxes = new Map<
      string,
      { center: THREE.Vector3; size: THREE.Vector3 }
    >();
    const recomputeBodyLocalBox = () => {
      const b = new THREE.Box3();
      const ptMin = new THREE.Vector3();
      const ptMax = new THREE.Vector3();
      restLocalBoxes.forEach((entry, pid) => {
        if (pid === 'skin_envelope') return;
        ptMin.copy(entry.center).addScaledVector(entry.size, -0.5);
        ptMax.copy(entry.center).addScaledVector(entry.size, 0.5);
        b.expandByPoint(ptMin);
        b.expandByPoint(ptMax);
      });
      if (!b.isEmpty()) {
        bodyLocalBox.copy(b);
      }
    };
    const bilateralSubBoxes = new Map<
      string,
      {
        right?: { center: THREE.Vector3; size: THREE.Vector3 };
        left?: { center: THREE.Vector3; size: THREE.Vector3 };
      }
    >();
    const boneMaterialsById: Record<string, THREE.MeshPhysicalMaterial> = {};
    const hdLoadedSet = new Set<string>();
    const hdInFlightSet = new Set<string>();
    const pendingHdAfterSkeleton = new Set<string>();
    const hdMaterialsToDispose: THREE.Material[] = [];
    const clonedSculptMaterialsToDispose: THREE.Material[] = [];
    const hdGeometriesToDispose: THREE.BufferGeometry[] = [];
    const originalSculptColors = new Map<
      THREE.Material,
      { color: number; emissive: number; emissiveIntensity: number; opacity: number }
    >();

    Object.values(sculpted.materials).forEach((m) => {
      const mat = m as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      originalSculptColors.set(mat, {
        color: mat.color.getHex(),
        emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
        emissiveIntensity: mat.emissiveIntensity ?? 0,
        opacity: mat.opacity,
      });
    });

    Object.entries(sculpted.partGroups).forEach(([partId, grp]) => {
      // Measure rest-pose local bounding box before adding to anatomicalRoot or exploding
      grp.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(grp);
      if (!b.isEmpty()) {
        restLocalBoxes.set(partId, {
          center: b.getCenter(new THREE.Vector3()),
          size: b.getSize(new THREE.Vector3()),
        });
      }
      if (grp.userData.isBilateral) {
        const rSub = grp.children.find((c) => c.userData.bilateralSide === -1);
        const lSub = grp.children.find((c) => c.userData.bilateralSide === 1);
        const entry: {
          right?: { center: THREE.Vector3; size: THREE.Vector3 };
          left?: { center: THREE.Vector3; size: THREE.Vector3 };
        } = {};
        if (rSub) {
          const rb = new THREE.Box3().setFromObject(rSub);
          if (!rb.isEmpty()) {
            entry.right = {
              center: rb.getCenter(new THREE.Vector3()),
              size: rb.getSize(new THREE.Vector3()),
            };
          }
        }
        if (lSub) {
          const lb = new THREE.Box3().setFromObject(lSub);
          if (!lb.isEmpty()) {
            entry.left = {
              center: lb.getCenter(new THREE.Vector3()),
              size: lb.getSize(new THREE.Vector3()),
            };
          }
        }
        bilateralSubBoxes.set(partId, entry);
      }
      anatomicalRoot.add(grp);
    });

    // Clone materials per sculpted group so individual part highlighting / isolation dimming works cleanly
    const partOriginalMaterials = new Map<
      string,
      Array<{
        mesh: THREE.Mesh;
        baseMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      }>
    >();

    Object.entries(sculpted.partGroups).forEach(([partId, grp]) => {
      const entries: Array<{
        mesh: THREE.Mesh;
        baseMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      }> = [];
      grp.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const cloned = (mesh.material as THREE.MeshPhysicalMaterial).clone();
          clonedSculptMaterialsToDispose.push(cloned);
          mesh.material = cloned;
          entries.push({ mesh, baseMat: cloned });
          originalSculptColors.set(cloned, {
            color: cloned.color.getHex(),
            emissive: cloned.emissive ? cloned.emissive.getHex() : 0x000000,
            emissiveIntensity: cloned.emissiveIntensity ?? 0,
            opacity: cloned.opacity,
          });
        }
      });
      partOriginalMaterials.set(partId, entries);
    });

    /* -------------------- 4. LOAD DRACO-COMPRESSED BASE SKELETON & ENVELOPE -------------------- */
    let isDisposed = false;
    let baseSkeletonLoaded = false;

    const ensureHdPartLoaded = async (partId: string): Promise<void> => {
      const cfg = HD_PART_CONFIGS[partId];
      if (!cfg || isDisposed || hdLoadedSet.has(partId) || hdInFlightSet.has(partId)) {
        return;
      }

      if (!baseSkeletonLoaded && PARTS_BY_ID[partId]?.glbMeshName) {
        pendingHdAfterSkeleton.add(partId);
        return;
      }

      const partGroup = allPartGroups[partId];
      const baseBox = restLocalBoxes.get(partId);
      if (!partGroup || !baseBox) return;

      hdInFlightSet.add(partId);
      onHdStatusChangeRef.current(partId, 'loading');

      try {
        const template = await loadHdPartScene(partId);
        if (isDisposed) return;

        const hdScene = template.clone(true);
        if (cfg.rotY) {
          hdScene.rotation.y = cfg.rotY;
        }
        hdScene.updateMatrixWorld(true);
        ensureBoxUVs(hdScene, cfg.profile === 'bone' ? 2.2 : 1.8);

        const hdBox = new THREE.Box3().setFromObject(hdScene);
        const hdSize = hdBox.getSize(new THREE.Vector3());
        const hdCenter = hdBox.getCenter(new THREE.Vector3());

        const sx = baseBox.size.x / Math.max(hdSize.x, 1e-4);
        const sy = baseBox.size.y / Math.max(hdSize.y, 1e-4);
        const sz = baseBox.size.z / Math.max(hdSize.z, 1e-4);
        const fitScale = Math.min(sx, sy, sz) * (cfg.scaleFit ?? 1.0);

        const sourceMatCache = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
        const hdPartEntries: Array<{
          mesh: THREE.Mesh;
          baseMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        }> = [];
        const boneMat = boneMaterialsById[partId];

        hdScene.traverse((child) => {
          child.userData.partId = partId;
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (cfg.profile === 'bone' && boneMat) {
              mesh.material = boneMat;
            } else {
              const rawMat = Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;
              let upgraded = sourceMatCache.get(rawMat);
              if (!upgraded) {
                upgraded = upgradeHdOrganMaterial(
                  mesh.material,
                  cfg.profile,
                  organMicroTex,
                  ktx2Set
                );
                sourceMatCache.set(rawMat, upgraded);
                hdMaterialsToDispose.push(upgraded);
                originalSculptColors.set(upgraded, {
                  color: upgraded.color.getHex(),
                  emissive: upgraded.emissive ? upgraded.emissive.getHex() : 0x000000,
                  emissiveIntensity: upgraded.emissiveIntensity ?? 0,
                  opacity: upgraded.opacity,
                });
              }
              mesh.material = upgraded;
              hdPartEntries.push({ mesh, baseMat: upgraded });
            }
          }
        });

        if (cfg.profile !== 'bone' && hdPartEntries.length > 0) {
          partOriginalMaterials.set(partId, hdPartEntries);
        }

        if (cfg.mountInHeartPivot && sculpted.animatedRefs.heartGroup) {
          const beatPivot = sculpted.animatedRefs.heartGroup;
          [...beatPivot.children].forEach((c) => beatPivot.remove(c));

          const hdHolder = new THREE.Group();
          hdHolder.position.copy(baseBox.center).sub(beatPivot.position);
          hdHolder.scale.setScalar(fitScale);
          hdScene.position.copy(hdCenter).multiplyScalar(-1);
          hdHolder.add(hdScene);
          beatPivot.add(hdHolder);
        } else if (cfg.mirrorPair && cfg.bilateral && partGroup.userData.isBilateral) {
          const rightSub =
            partGroup.children.find((c) => c.userData.bilateralSide === -1) ??
            partGroup;
          const leftSub =
            partGroup.children.find((c) => c.userData.bilateralSide === 1) ??
            partGroup;
          const centerSub =
            partGroup.children.find((c) => c.userData.bilateralSide === 0) ??
            partGroup;

          [rightSub, leftSub, centerSub].forEach((sub) => {
            [...sub.children].forEach((c) => sub.remove(c));
          });

          const subBoxes = bilateralSubBoxes.get(partId);
          const rightBox = subBoxes?.right ?? baseBox;
          const leftBox = subBoxes?.left ?? baseBox;
          const pairScale =
            Math.min(
              rightBox.size.x / Math.max(hdSize.x, 1e-4),
              rightBox.size.y / Math.max(hdSize.y, 1e-4),
              rightBox.size.z / Math.max(hdSize.z, 1e-4)
            ) * (cfg.scaleFit ?? 1.0);

          const rightHolder = new THREE.Group();
          rightHolder.position.copy(rightBox.center);
          rightHolder.scale.setScalar(pairScale);
          hdScene.position.copy(hdCenter).multiplyScalar(-1);
          rightHolder.add(hdScene);
          rightSub.add(rightHolder);

          const leftClone = hdScene.clone(true);
          leftClone.position.set(0, 0, 0);
          leftClone.updateMatrixWorld(true);
          mirrorObjectGeometryX(leftClone, hdGeometriesToDispose);
          leftClone.traverse((child) => {
            child.userData.partId = partId;
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const baseMat = mesh.material as THREE.MeshPhysicalMaterial;
              if (baseMat && hdPartEntries.length > 0) {
                hdPartEntries.push({ mesh, baseMat });
              }
            }
          });
          leftClone.updateMatrixWorld(true);
          const leftCenter = new THREE.Box3().setFromObject(leftClone).getCenter(new THREE.Vector3());
          leftClone.position.copy(leftCenter).multiplyScalar(-1);

          const leftHolder = new THREE.Group();
          leftHolder.position.copy(leftBox.center);
          leftHolder.scale.setScalar(pairScale);
          leftHolder.add(leftClone);
          leftSub.add(leftHolder);

          if (cfg.profile !== 'bone' && hdPartEntries.length > 0) {
            partOriginalMaterials.set(partId, hdPartEntries);
          }
        } else if (cfg.bilateral && partGroup.userData.isBilateral) {
          const rightSub =
            partGroup.children.find((c) => c.userData.bilateralSide === -1) ??
            partGroup;
          const leftSub =
            partGroup.children.find((c) => c.userData.bilateralSide === 1) ??
            partGroup;
          const centerSub =
            partGroup.children.find((c) => c.userData.bilateralSide === 0) ??
            partGroup;

          [rightSub, leftSub, centerSub].forEach((sub) => {
            [...sub.children].forEach((c) => sub.remove(c));
          });

          const collectMeshes: Array<{
            mesh: THREE.Mesh;
            side: -1 | 0 | 1;
            restCenter: THREE.Vector3;
          }> = [];

          hdScene.updateMatrixWorld(true);
          const invHdSceneWorld = new THREE.Matrix4().copy(hdScene.matrixWorld).invert();
          const relMat = new THREE.Matrix4();

          hdScene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const m = obj as THREE.Mesh;
              const mb = new THREE.Box3().setFromObject(m);
              const mc = mb.getCenter(new THREE.Vector3());
              const relX = mc.x - hdCenter.x;
              let side: -1 | 0 | 1 = 0;
              if (/^right-/i.test(m.name)) side = -1;
              else if (/^left-/i.test(m.name)) side = 1;
              else if (relX < -hdSize.x * 0.08) side = -1;
              else if (relX > hdSize.x * 0.08) side = 1;

              relMat.multiplyMatrices(invHdSceneWorld, m.matrixWorld);
              m.matrix.copy(relMat);
              m.matrix.decompose(m.position, m.quaternion, m.scale);
              m.updateMatrix();

              const restCenter = mc
                .clone()
                .sub(hdCenter)
                .multiplyScalar(fitScale)
                .add(baseBox.center);
              collectMeshes.push({ mesh: m, side, restCenter });
            }
          });

          const addMeshesWithCenterPivot = (
            targetSub: THREE.Object3D,
            items: typeof collectMeshes
          ): THREE.Group | undefined => {
            if (items.length === 0) return undefined;
            const avgCenter = new THREE.Vector3();
            items.forEach((it) => avgCenter.add(it.restCenter));
            avgCenter.divideScalar(items.length);

            const pivot = new THREE.Group();
            pivot.position.copy(avgCenter);

            const inner = new THREE.Group();
            inner.scale.setScalar(fitScale);
            inner.position
              .copy(baseBox.center)
              .sub(avgCenter)
              .addScaledVector(hdCenter, -fitScale);

            items.forEach((it) => inner.add(it.mesh));
            pivot.add(inner);
            targetSub.add(pivot);
            return pivot;
          };

          const rPivot = addMeshesWithCenterPivot(
            rightSub,
            collectMeshes.filter((i) => i.side === -1)
          );
          const lPivot = addMeshesWithCenterPivot(
            leftSub,
            collectMeshes.filter((i) => i.side === 1)
          );
          addMeshesWithCenterPivot(
            centerSub,
            collectMeshes.filter((i) => i.side === 0)
          );

          if (partId === 'organ_lungs') {
            if (rPivot) sculpted.animatedRefs.rightLung = rPivot;
            if (lPivot) sculpted.animatedRefs.leftLung = lPivot;
          }
        } else {
          [...partGroup.children].forEach((c) => partGroup.remove(c));

          const hdHolder = new THREE.Group();
          hdHolder.position.copy(baseBox.center);
          hdHolder.scale.setScalar(fitScale);
          hdScene.position.copy(hdCenter).multiplyScalar(-1);
          hdHolder.add(hdScene);
          partGroup.add(hdHolder);
        }

        hdLoadedSet.add(partId);
        hdInFlightSet.delete(partId);
        onHdStatusChangeRef.current(partId, 'loaded');
      } catch (err) {
        hdInFlightSet.delete(partId);
        if (!isDisposed) {
          console.error(`HD load failed for ${partId}:`, err);
          onHdStatusChangeRef.current(partId, 'error');
        }
      }
    };

    hdTriggerRef.current = ensureHdPartLoaded;

    const loader = createDracoGltfLoader();
    loader.load(
      `${import.meta.env.BASE_URL}models/human-skeleton.glb`,
      (gltf) => {
        if (isDisposed) return;
        const rawScene = gltf.scene;
        let loadedCount = 0;

        ANATOMY_PARTS.filter((p) => p.glbMeshName).forEach((part) => {
          const found = rawScene.getObjectByName(part.glbMeshName!);
          if (!found) return;

          const partGroup = new THREE.Group();
          partGroup.name = part.id;
          partGroup.userData.partId = part.id;

          const cloned = found.clone(true);
          const isSkin = part.id === 'skin_envelope';
          const mat = isSkin ? skinShellMat : boneBaseMat.clone();

          if (!isSkin) {
            boneMaterialsById[part.id] = mat as THREE.MeshPhysicalMaterial;
          }

          cloned.traverse((child) => {
            child.userData.partId = part.id;
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.material = mat;
              mesh.castShadow = !isSkin;
              mesh.receiveShadow = !isSkin;
            }
          });
          if (!isSkin) {
            ensureBoxUVs(cloned, 2.2);
          }

          partGroup.add(cloned);

          // Attach tiny 6-vertex sacral fragment SM_HumanSkeleton_11 directly onto Pelvic Girdle
          if (part.id === 'SM_HumanSkeleton_16') {
            const frag = rawScene.getObjectByName('SM_HumanSkeleton_11');
            if (frag) {
              const fragClone = frag.clone(true);
              fragClone.traverse((c) => {
                c.userData.partId = part.id;
                if ((c as THREE.Mesh).isMesh) {
                  (c as THREE.Mesh).material = mat;
                }
              });
              partGroup.add(fragClone);
            }
          }

          // Capture rest-pose local bounding box before adding to anatomicalRoot
          partGroup.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(partGroup);
          if (!b.isEmpty()) {
            restLocalBoxes.set(part.id, {
              center: b.getCenter(new THREE.Vector3()),
              size: b.getSize(new THREE.Vector3()),
            });
          }

          anatomicalRoot.add(partGroup);
          allPartGroups[part.id] = partGroup;
          loadedCount++;
        });

        baseSkeletonLoaded = true;
        recomputeBodyLocalBox();
        onModelReady(loadedCount);

        if (pendingHdAfterSkeleton.size > 0) {
          const queued = [...pendingHdAfterSkeleton];
          pendingHdAfterSkeleton.clear();
          queued.forEach((pid) => {
            void ensureHdPartLoaded(pid);
          });
        }
      },
      undefined,
      (err) => {
        if (!isDisposed) {
          onModelError(err instanceof Error ? err.message : 'Failed to load 3D skeleton GLB');
        }
      }
    );

    // Async Basis Universal KTX2 GPU-compressed PBR normal & roughness upgrade
    void loadKtx2PbrTextures(renderer).then((loadedKtx2) => {
      if (isDisposed || !loadedKtx2) {
        loadedKtx2?.dispose();
        return;
      }
      ktx2Set = loadedKtx2;

      boneBaseMat.normalMap = loadedKtx2.boneNormal;
      boneBaseMat.normalScale.set(0.28, 0.28);
      boneBaseMat.roughnessMap = loadedKtx2.boneRoughness;
      boneBaseMat.bumpMap = null;
      boneBaseMat.needsUpdate = true;

      Object.entries(boneMaterialsById).forEach(([pid, bMat]) => {
        const grp = allPartGroups[pid];
        if (grp) ensureBoxUVs(grp, 2.2);
        bMat.normalMap = loadedKtx2.boneNormal;
        bMat.normalScale.set(0.28, 0.28);
        bMat.roughnessMap = loadedKtx2.boneRoughness;
        bMat.bumpMap = null;
        bMat.needsUpdate = true;
      });

      partOriginalMaterials.forEach((entries, pid) => {
        const p = PARTS_BY_ID[pid];
        const grp = allPartGroups[pid];
        if (!p || !grp) return;
        const isOrganSurface =
          p.system === 'organs' ||
          pid.startsWith('organ_brain') ||
          pid === 'organ_eyes';
        const isMuscle = p.system === 'muscular';
        if (!isOrganSurface && !isMuscle) return;

        ensureBoxUVs(grp, 1.8);
        entries.forEach(({ baseMat }) => {
          const phys = baseMat as THREE.MeshPhysicalMaterial;
          phys.normalMap = isMuscle
            ? loadedKtx2.muscleNormal
            : loadedKtx2.organNormal;
          phys.normalScale.set(isMuscle ? 0.36 : 0.28, isMuscle ? 0.36 : 0.28);
          if (!isMuscle) {
            phys.roughnessMap = loadedKtx2.organRoughness;
          }
          phys.bumpMap = null;
          phys.needsUpdate = true;
        });
      });

      onKtx2ReadyRef.current?.(true);
    });

    /* -------------------- 5. DIRECT 3D RAYCASTING (HOVER, CLICK, DOUBLE-CLICK) -------------------- */
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownXY = { x: 0, y: 0 };

    const pickPartAtEvent = (e: PointerEvent | MouseEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const { layerStates: layers, isolatedPartId: isoId } = propsRef.current;

      // Gather pickable meshes: prioritize internal structures over translucent skin envelope
      const primaryTargets: THREE.Object3D[] = [];
      const fallbackSkin: THREE.Object3D[] = [];

      Object.entries(allPartGroups).forEach(([id, grp]) => {
        if (!grp.visible) return;
        const part = PARTS_BY_ID[id];
        if (!part) return;
        if (isoId && id !== isoId) return; // In isolation mode, pick only the isolated structure
        if (id === 'skin_envelope') {
          fallbackSkin.push(grp);
        } else if (layers[part.system]?.active) {
          primaryTargets.push(grp);
        }
      });

      const hits = raycaster.intersectObjects(primaryTargets, true);
      for (const hit of hits) {
        if (propsRef.current.sliceConfig.enabled && clipPlane.distanceToPoint(hit.point) < -1e-4) {
          continue;
        }
        const pid = hit.object.userData?.partId as string | undefined;
        if (pid && PARTS_BY_ID[pid]) return pid;
      }

      if (fallbackSkin.length > 0 && primaryTargets.length === 0) {
        const skinHits = raycaster.intersectObjects(fallbackSkin, true);
        for (const hit of skinHits) {
          if (propsRef.current.sliceConfig.enabled && clipPlane.distanceToPoint(hit.point) < -1e-4) {
            continue;
          }
          const pid = hit.object.userData?.partId as string | undefined;
          if (pid && PARTS_BY_ID[pid]) return pid;
        }
      }

      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownXY = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const hitId = pickPartAtEvent(e);
      setHoveredId((prev) => (prev === hitId ? prev : hitId));
      if (hitId) {
        setHoverScreenPos({ x: e.clientX, y: e.clientY });
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(
        e.clientX - pointerDownXY.x,
        e.clientY - pointerDownXY.y
      );
      if (dist > 6) return; // Dragged to orbit
      const hitId = pickPartAtEvent(e);
      if (hitId) {
        propsRef.current.onSelectPart(hitId);
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      const hitId = pickPartAtEvent(e);
      if (hitId) {
        propsRef.current.onIsolatePart(hitId);
      }
    };

    const handlePointerLeave = () => {
      setHoveredId(null);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', handlePointerDown);
    domEl.addEventListener('pointermove', handlePointerMove);
    domEl.addEventListener('pointerup', handlePointerUp);
    domEl.addEventListener('dblclick', handleDoubleClick);
    domEl.addEventListener('pointerleave', handlePointerLeave);

    /* -------------------- 6. ANIMATION LOOP & DISSECTION PHYSICS -------------------- */
    const clock = new THREE.Clock();
    let physioTime = 0;
    let rafId = 0;
    let lastPresetTick = 0;
    let presetBlendTimer = 0;
    let lastZoomTick = 0;

    const handleControlStart = () => {
      presetBlendTimer = 0;
    };
    controls.addEventListener('start', handleControlStart);

    const targetPos = new THREE.Vector3();
    const targetRot = new THREE.Euler();
    const desiredCamPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    const camOffsetVec = new THREE.Vector3();
    const box3 = new THREE.Box3();
    const boxCenter = new THREE.Vector3();
    const projV3 = new THREE.Vector3();
    const sliceBoxMin = new THREE.Vector3();
    const sliceBoxMax = new THREE.Vector3();
    const sliceLocalCenter = new THREE.Vector3();
    const sliceHalfSize = new THREE.Vector3();
    const dynamicBodyBox = new THREE.Box3();

    const PRESET_VIEWS: Record<
      Exclude<CameraPreset, 'default'>,
      { cam: [number, number, number]; look: [number, number, number] }
    > = {
      anterior: { cam: [0, -0.04, 5.75], look: [0, -0.06, 0] },
      posterior: { cam: [0, -0.04, -5.75], look: [0, -0.06, 0] },
      left: { cam: [5.75, -0.04, 0], look: [0, -0.06, 0] },
      right: { cam: [-5.75, -0.04, 0], look: [0, -0.06, 0] },
      superior: { cam: [0, 4.8, 1.5], look: [0, 0.25, 0] },
    };

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const delta = Math.min(0.05, clock.getDelta());
      const state = propsRef.current;

      if (state.isPlaying) {
        physioTime += delta;
      }

      const activeChapterData = CHAPTERS[state.activeChapter] ?? CHAPTERS[0];
      const chapterHighlights = activeChapterData.highlights;
      const wantClip = state.sliceConfig.enabled;
      applyClipState(boneBaseMat, wantClip);

      /* --- A. Update Dissection Offsets (with Symmetric Bilateral Sub-Groups) --- */
      const peelEase = 1 - Math.pow(1 - state.scrollProgress, 2.5);

      ANATOMY_PARTS.forEach((part) => {
        const grp = allPartGroups[part.id];
        if (!grp) return;

        const layerCfg = state.layerStates[part.system];
        const isLayerActive = layerCfg?.active ?? true;
        const sysCfg = SYSTEM_MAP[part.system];

        if (state.isolatedPartId) {
          const isTarget = part.id === state.isolatedPartId;
          grp.visible =
            isTarget ||
            (state.isolationGhostContext && isLayerActive && part.id !== 'skin_envelope');
        } else {
          grp.visible = isLayerActive;
        }

        if (!grp.visible) return;

        const [stStart, stEnd] = part.stagger;
        const rawT = Math.max(
          0,
          Math.min(1, (state.scrollProgress - stStart) / Math.max(0.01, stEnd - stStart))
        );
        const easeOutT = 1 - Math.pow(1 - rawT, 3);
        const isBilateral = Boolean(grp.userData.isBilateral);
        const peelScale = state.dissectionMode === 'peel' ? 0.28 : 1.0;

        if (state.dissectionMode === 'peel' && sysCfg) {
          targetPos.set(
            sysCfg.peelOffset[0] * peelEase +
              (isBilateral ? 0 : part.explodeOffset[0] * 0.28 * easeOutT),
            sysCfg.peelOffset[1] * peelEase + part.explodeOffset[1] * 0.28 * easeOutT,
            sysCfg.peelOffset[2] * peelEase + part.explodeOffset[2] * 0.28 * easeOutT
          );
          targetRot.set(
            part.explodeRot[0] * 0.35 * easeOutT,
            part.explodeRot[1] * 0.35 * easeOutT,
            part.explodeRot[2] * 0.35 * easeOutT
          );
        } else {
          targetPos.set(
            isBilateral ? 0 : part.explodeOffset[0] * easeOutT,
            part.explodeOffset[1] * easeOutT,
            part.explodeOffset[2] * easeOutT
          );
          targetRot.set(
            part.explodeRot[0] * easeOutT,
            part.explodeRot[1] * easeOutT,
            part.explodeRot[2] * easeOutT
          );
        }

        grp.position.lerp(targetPos, Math.min(1, delta * 9));
        grp.rotation.x = THREE.MathUtils.lerp(grp.rotation.x, targetRot.x, Math.min(1, delta * 9));
        grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetRot.y, Math.min(1, delta * 9));
        grp.rotation.z = THREE.MathUtils.lerp(grp.rotation.z, targetRot.z, Math.min(1, delta * 9));

        if (isBilateral) {
          const lateralMag = Math.abs(part.explodeOffset[0]) * peelScale * easeOutT;
          for (let ci = 0; ci < grp.children.length; ci++) {
            const sub = grp.children[ci];
            const bSide = sub.userData.bilateralSide as number | undefined;
            if (bSide === -1 || bSide === 1 || bSide === 0) {
              sub.position.x = THREE.MathUtils.lerp(
                sub.position.x,
                bSide * lateralMag,
                Math.min(1, delta * 9)
              );
            }
          }
        }

        /* --- B. Material Styling (Imaging Modes + Selection + Hover + Isolation Ghosting) --- */
        const isSelected = part.id === state.selectedPartId;
        const isHovered = part.id === state.hoveredId;
        const isHighlighted =
          isSelected ||
          isHovered ||
          (state.activeChapter > 0 &&
            state.activeChapter < 6 &&
            chapterHighlights.includes(part.id));
        const hasChapterFocus =
          chapterHighlights.length > 0 && state.activeChapter > 0 && state.activeChapter < 6;
        const isGhostedByIsolation =
          Boolean(state.isolatedPartId) && part.id !== state.isolatedPartId;

        const baseSysOpacity = layerCfg?.opacity ?? 1.0;

        if (part.id === 'skin_envelope') {
          skinShellMat.opacity = isGhostedByIsolation ? 0.04 : baseSysOpacity;
          applyClipState(skinShellMat, wantClip);
        } else if (part.glbMeshName && boneMaterialsById[part.id]) {
          const bMat = boneMaterialsById[part.id];
          applyClipState(bMat, wantClip);
          if (isGhostedByIsolation) {
            bMat.color.setHex(0x64748b);
            bMat.emissive.setHex(0x000000);
            bMat.emissiveIntensity = 0;
            bMat.opacity = 0.05;
            bMat.depthWrite = false;
          } else if (state.imagingMode === 'xray') {
            bMat.color.setHex(isSelected || isHovered ? 0xe0f2fe : 0x38bdf8);
            bMat.emissive.setHex(isSelected || isHovered ? 0x0ea5e9 : 0x0369a1);
            bMat.emissiveIntensity = isSelected || isHovered ? 1.15 : isHighlighted ? 0.72 : 0.38;
            bMat.opacity = Math.min(baseSysOpacity, isSelected ? 0.94 : 0.58);
            bMat.depthWrite = false;
          } else if (state.imagingMode === 'neurovascular') {
            bMat.color.setHex(0x94a3b8);
            bMat.emissive.setHex(0x000000);
            bMat.emissiveIntensity = 0;
            bMat.opacity = Math.min(baseSysOpacity, isSelected ? 0.85 : 0.16);
            bMat.depthWrite = isSelected;
          } else {
            // Realistic PBR Bone
            const isIsoTarget = state.isolatedPartId === part.id;
            if (isIsoTarget) {
              bMat.color.setHex(0xf3ede2);
              bMat.emissive.setHex(0x000000);
              bMat.emissiveIntensity = 0;
            } else if (isSelected || isHovered) {
              bMat.color.setHex(0xffffff);
              bMat.emissive.setHex(0x0ea5e9);
              bMat.emissiveIntensity = isSelected ? 0.32 : 0.22;
            } else if (isHighlighted) {
              bMat.color.setHex(0xfef9f0);
              bMat.emissive.setHex(0x0284c7);
              bMat.emissiveIntensity = 0.14;
            } else if (hasChapterFocus && !state.selectedPartId) {
              bMat.color.setHex(0x7c7870);
              bMat.emissive.setHex(0x000000);
              bMat.emissiveIntensity = 0;
            } else {
              bMat.color.setHex(0xf1ebe0);
              bMat.emissive.setHex(0x000000);
              bMat.emissiveIntensity = 0;
            }
            bMat.opacity = baseSysOpacity;
            bMat.depthWrite = baseSysOpacity >= 0.95;
          }
        } else {
          // Sculpted Non-Skeletal System Materials
          const matEntries = partOriginalMaterials.get(part.id);
          if (matEntries) {
            const bioPulse = 0.55 + Math.sin(physioTime * 3.2) * 0.25;
            const isIsoTarget = state.isolatedPartId === part.id;
            matEntries.forEach(({ baseMat }) => {
              const orig = originalSculptColors.get(baseMat);
              if (!orig) return;
              applyClipState(baseMat, wantClip);

              if (isGhostedByIsolation) {
                baseMat.color.setHex(orig.color);
                if (baseMat.emissive) {
                  baseMat.emissive.setHex(0x000000);
                  baseMat.emissiveIntensity = 0;
                }
                baseMat.opacity = 0.04;
                baseMat.depthWrite = false;
              } else if (state.imagingMode === 'xray') {
                const isNV = part.system === 'nervous' || part.system === 'vascular';
                baseMat.color.setHex(
                  part.system === 'nervous'
                    ? 0xfef08a
                    : part.system === 'vascular'
                      ? 0x38bdf8
                      : orig.color
                );
                if (baseMat.emissive) {
                  baseMat.emissive.setHex(
                    part.system === 'nervous'
                      ? 0xeab308
                      : part.system === 'vascular'
                        ? 0x0284c7
                        : orig.emissive
                  );
                  baseMat.emissiveIntensity = isSelected || isHovered ? 0.85 : isNV ? 0.65 : 0.25;
                }
                baseMat.opacity = isNV
                  ? baseSysOpacity
                  : Math.min(baseSysOpacity, part.system === 'muscular' ? 0.22 : 0.55);
                baseMat.depthWrite = baseMat.opacity >= 0.92;
              } else if (state.imagingMode === 'neurovascular') {
                const isNV = part.system === 'nervous' || part.system === 'vascular';
                baseMat.color.setHex(orig.color);
                if (baseMat.emissive) {
                  baseMat.emissive.setHex(orig.emissive);
                  baseMat.emissiveIntensity = isNV ? 0.95 * bioPulse : isSelected ? 0.35 : 0.08;
                }
                baseMat.opacity = isNV
                  ? baseSysOpacity
                  : Math.min(baseSysOpacity, isSelected ? 0.9 : 0.14);
                baseMat.depthWrite = isNV || isSelected;
              } else {
                baseMat.color.setHex(orig.color);
                if (baseMat.emissive) {
                  if (isIsoTarget) {
                    // Authentic PBR look during 360° isolation
                    baseMat.emissive.setHex(orig.emissive);
                    baseMat.emissiveIntensity = orig.emissiveIntensity;
                  } else if (isSelected || isHovered) {
                    baseMat.emissive.setHex(orig.color);
                    baseMat.emissiveIntensity = isSelected ? 0.28 : 0.18;
                  } else {
                    baseMat.emissive.setHex(orig.emissive);
                    baseMat.emissiveIntensity =
                      part.system === 'nervous'
                        ? orig.emissiveIntensity * (0.75 + Math.sin(physioTime * 3.5) * 0.35)
                        : orig.emissiveIntensity;
                  }
                }
                baseMat.opacity = orig.opacity * baseSysOpacity;
                baseMat.depthWrite = baseMat.opacity >= 0.94;
              }
            });
          }
        }
      });

      /* --- C. Real-Time Physiological Animations (Cardiac Beat & Lung Respiration) --- */
      if (sculpted.animatedRefs.heartGroup) {
        const bps = state.heartRateBpm / 60;
        const phase = (physioTime * bps) % 1;
        // Physiological systolic lub-dub pulse curve
        const lub = Math.exp(-Math.pow((phase - 0.14) / 0.055, 2));
        const dub = 0.55 * Math.exp(-Math.pow((phase - 0.32) / 0.06, 2));
        const pulseScale = 1 + 0.058 * (lub + dub);
        sculpted.animatedRefs.heartGroup.scale.set(
          pulseScale,
          pulseScale * 0.985,
          pulseScale
        );
      }

      const breathWave = Math.sin(physioTime * ((16 / 60) * Math.PI * 2));
      const lungScaleX = 1 + breathWave * 0.035;
      const lungScaleZ = 1 + breathWave * 0.045;
      if (sculpted.animatedRefs.leftLung) {
        sculpted.animatedRefs.leftLung.scale.set(lungScaleX, 1 + breathWave * 0.02, lungScaleZ);
      }
      if (sculpted.animatedRefs.rightLung) {
        sculpted.animatedRefs.rightLung.scale.set(lungScaleX, 1 + breathWave * 0.02, lungScaleZ);
      }
      if (sculpted.animatedRefs.diaphragm) {
        sculpted.animatedRefs.diaphragm.position.y = 123.5 - breathWave * 0.75;
      }

      /* --- D. Camera Choreography, Presets & 360° Part Isolation Focus --- */
      const isDesktop = window.innerWidth >= 1024;
      const rightSpaceShift = isDesktop ? 0.42 : window.innerWidth >= 768 ? 0.25 : 0;
      const rootTargetX =
        state.isolatedPartId || state.selectedPartId || state.cinemaMode
          ? 0
          : rightSpaceShift;

      if (state.isolatedPartId) {
        anatomicalRoot.position.x = 0;
      } else {
        anatomicalRoot.position.x = THREE.MathUtils.lerp(
          anatomicalRoot.position.x,
          rootTargetX,
          Math.min(1, delta * 7)
        );
      }

      if (state.cameraPresetTick !== lastPresetTick) {
        lastPresetTick = state.cameraPresetTick;
        presetBlendTimer = 0.85;
      }

      if (state.zoomCommand && state.zoomCommand.tick !== lastZoomTick) {
        lastZoomTick = state.zoomCommand.tick;
        camOffsetVec.subVectors(camera.position, controls.target);
        const factor = state.zoomCommand.delta > 0 ? 0.82 : 1.22;
        const nextLen = Math.max(0.45, Math.min(8.2, camOffsetVec.length() * factor));
        camOffsetVec.setLength(nextLen);
        camera.position.copy(controls.target).add(camOffsetVec);
      }

      if (state.autoSpin && !state.isolatedPartId) {
        anatomicalRoot.rotation.y += delta * 0.38;
      } else if (!state.isolatedPartId) {
        const idleBreathYaw =
          state.scrollProgress < 0.08 && state.isPlaying && state.cameraPreset === 'default'
            ? Math.sin(physioTime * 0.9) * 0.06
            : 0;
        anatomicalRoot.rotation.y = THREE.MathUtils.lerp(
          anatomicalRoot.rotation.y,
          idleBreathYaw,
          Math.min(1, delta * 5)
        );
      }

      // Check Isolation entry/exit transition
      const isolatedGroup = state.isolatedPartId
        ? allPartGroups[state.isolatedPartId]
        : null;

      controls.enableZoom = Boolean(state.isolatedPartId) || state.cinemaMode;

      if (state.isolatedPartId && isolatedGroup) {
        controls.enabled = true;
        anatomicalRoot.updateMatrixWorld(true);
        box3.setFromObject(isolatedGroup);
        box3.getCenter(boxCenter);

        if (prevIsolatedRef.current !== state.isolatedPartId) {
          const isoPart = PARTS_BY_ID[state.isolatedPartId];
          const dist = isoPart?.isolateDistance ?? 0.85;
          controls.target.copy(boxCenter);
          camera.position.set(
            boxCenter.x + dist * 0.25,
            boxCenter.y + dist * 0.14,
            boxCenter.z + dist
          );
          prevIsolatedRef.current = state.isolatedPartId;
          presetBlendTimer = 0;
        } else if (presetBlendTimer > 0) {
          presetBlendTimer = Math.max(0, presetBlendTimer - delta);
          const isoPart = PARTS_BY_ID[state.isolatedPartId];
          const dist = isoPart?.isolateDistance ?? 0.85;
          if (state.cameraPreset === 'anterior') {
            desiredCamPos.set(boxCenter.x, boxCenter.y, boxCenter.z + dist);
          } else if (state.cameraPreset === 'posterior') {
            desiredCamPos.set(boxCenter.x, boxCenter.y, boxCenter.z - dist);
          } else if (state.cameraPreset === 'left') {
            desiredCamPos.set(boxCenter.x + dist, boxCenter.y, boxCenter.z);
          } else if (state.cameraPreset === 'right') {
            desiredCamPos.set(boxCenter.x - dist, boxCenter.y, boxCenter.z);
          } else if (state.cameraPreset === 'superior') {
            desiredCamPos.set(
              boxCenter.x,
              boxCenter.y + dist * 0.95,
              boxCenter.z + dist * 0.22
            );
          } else {
            desiredCamPos.set(
              boxCenter.x + dist * 0.25,
              boxCenter.y + dist * 0.14,
              boxCenter.z + dist
            );
          }
          camera.position.lerp(desiredCamPos, Math.min(1, delta * 5.2));
          controls.target.lerp(boxCenter, Math.min(1, delta * 6.0));
        } else {
          controls.target.lerp(boxCenter, Math.min(1, delta * 6));
        }

        if (state.autoSpin) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 2.0;
        } else {
          controls.autoRotate = false;
        }
        controls.update();
      } else {
        if (prevIsolatedRef.current !== null) {
          prevIsolatedRef.current = null;
          controls.autoRotate = false;
        }

        const allowOrbit = state.freeOrbit || state.cinemaMode;
        if (allowOrbit) {
          controls.enabled = true;
          controls.autoRotate = state.autoSpin;
          controls.autoRotateSpeed = 1.5;

          if (presetBlendTimer > 0) {
            presetBlendTimer = Math.max(0, presetBlendTimer - delta);
            if (state.cameraPreset !== 'default') {
              const pCfg = PRESET_VIEWS[state.cameraPreset];
              desiredCamPos.set(pCfg.cam[0], pCfg.cam[1], pCfg.cam[2]);
              desiredLook.set(pCfg.look[0], pCfg.look[1], pCfg.look[2]);
            } else {
              const camArr = activeChapterData.cam;
              const lookArr = activeChapterData.look;
              desiredCamPos.set(camArr[0], camArr[1], camArr[2]);
              desiredLook.set(lookArr[0], lookArr[1], lookArr[2]);
            }
            camera.position.lerp(desiredCamPos, Math.min(1, delta * 5.2));
            controls.target.lerp(desiredLook, Math.min(1, delta * 6.0));
          }
          controls.update();
        } else {
          controls.enabled = false;
          if (state.cameraPreset !== 'default') {
            const pCfg = PRESET_VIEWS[state.cameraPreset];
            desiredCamPos.set(pCfg.cam[0], pCfg.cam[1], pCfg.cam[2]);
            desiredLook.set(pCfg.look[0], pCfg.look[1], pCfg.look[2]);
          } else {
            const camArr = activeChapterData.cam;
            const lookArr = activeChapterData.look;
            const zoomAdjust = state.dissectionMode === 'peel' ? 1.58 : 1.0;
            desiredCamPos.set(camArr[0], camArr[1], camArr[2] * zoomAdjust);
            desiredLook.set(lookArr[0], lookArr[1], lookArr[2]);
          }

          camera.position.lerp(desiredCamPos, Math.min(1, delta * 4.0));
          controls.target.lerp(desiredLook, Math.min(1, delta * 4.6));
          camera.lookAt(controls.target);
        }
      }

      /* --- D2. Real-Time MRI Cross-Section Plane & Clinical Scan Guide --- */
      if (wantClip) {
        const isoRest = state.isolatedPartId
          ? restLocalBoxes.get(state.isolatedPartId)
          : undefined;
        if (state.isolatedPartId && isolatedGroup && isoRest) {
          let maxSpreadX = 0;
          if (isolatedGroup.userData.isBilateral) {
            for (let ci = 0; ci < isolatedGroup.children.length; ci++) {
              maxSpreadX = Math.max(maxSpreadX, Math.abs(isolatedGroup.children[ci].position.x));
            }
          }
          sliceHalfSize.set(
            isoRest.size.x * 0.5 + maxSpreadX,
            isoRest.size.y * 0.5,
            isoRest.size.z * 0.5
          );
          sliceLocalCenter.copy(isoRest.center).add(isolatedGroup.position);
          sliceBoxMin.copy(sliceLocalCenter).sub(sliceHalfSize);
          sliceBoxMax.copy(sliceLocalCenter).add(sliceHalfSize);
        } else {
          dynamicBodyBox.makeEmpty();
          ANATOMY_PARTS.forEach((part) => {
            if (part.id === 'skin_envelope') return;
            const grp = allPartGroups[part.id];
            const rest = restLocalBoxes.get(part.id);
            if (!grp || !grp.visible || !rest) return;
            let maxSpreadX = 0;
            if (grp.userData.isBilateral) {
              for (let ci = 0; ci < grp.children.length; ci++) {
                maxSpreadX = Math.max(maxSpreadX, Math.abs(grp.children[ci].position.x));
              }
            }
            sliceHalfSize.set(
              rest.size.x * 0.5 + maxSpreadX,
              rest.size.y * 0.5,
              rest.size.z * 0.5
            );
            sliceLocalCenter.copy(rest.center).add(grp.position);
            sliceBoxMin.copy(sliceLocalCenter).sub(sliceHalfSize);
            sliceBoxMax.copy(sliceLocalCenter).add(sliceHalfSize);
            dynamicBodyBox.expandByPoint(sliceBoxMin);
            dynamicBodyBox.expandByPoint(sliceBoxMax);
          });
          if (dynamicBodyBox.isEmpty()) {
            sliceBoxMin.copy(bodyLocalBox.min);
            sliceBoxMax.copy(bodyLocalBox.max);
          } else {
            sliceBoxMin.copy(dynamicBodyBox.min);
            sliceBoxMax.copy(dynamicBodyBox.max);
          }
        }

        const cx = (sliceBoxMin.x + sliceBoxMax.x) * 0.5;
        const cy = (sliceBoxMin.y + sliceBoxMax.y) * 0.5;
        const cz = (sliceBoxMin.z + sliceBoxMax.z) * 0.5;
        const sizeX = Math.max(4, sliceBoxMax.x - sliceBoxMin.x);
        const sizeY = Math.max(4, sliceBoxMax.y - sliceBoxMin.y);
        const sizeZ = Math.max(4, sliceBoxMax.z - sliceBoxMin.z);
        const pad = Math.max(2.0, Math.min(sizeX, sizeY, sizeZ) * 0.16);
        const pos = THREE.MathUtils.clamp(state.sliceConfig.position, 0.02, 0.98);
        const inv = state.sliceConfig.invert;

        if (state.sliceConfig.axis === 'coronal') {
          const coord = THREE.MathUtils.lerp(sliceBoxMax.z + 0.5, sliceBoxMin.z - 0.5, pos);
          localPlane.normal.set(0, 0, inv ? 1 : -1);
          localPlane.constant = inv ? -coord : coord;
          sliceHelperGroup.position.set(cx, cy, coord);
          sliceHelperGroup.rotation.set(0, 0, 0);
          sliceHelperGroup.scale.set(sizeX + pad, sizeY + pad, 1);
        } else if (state.sliceConfig.axis === 'sagittal') {
          const coord = THREE.MathUtils.lerp(sliceBoxMax.x + 0.5, sliceBoxMin.x - 0.5, pos);
          localPlane.normal.set(inv ? 1 : -1, 0, 0);
          localPlane.constant = inv ? -coord : coord;
          sliceHelperGroup.position.set(coord, cy, cz);
          sliceHelperGroup.rotation.set(0, Math.PI / 2, 0);
          sliceHelperGroup.scale.set(sizeZ + pad, sizeY + pad, 1);
        } else {
          const coord = THREE.MathUtils.lerp(sliceBoxMax.y + 0.5, sliceBoxMin.y - 0.5, pos);
          localPlane.normal.set(0, inv ? 1 : -1, 0);
          localPlane.constant = inv ? -coord : coord;
          sliceHelperGroup.position.set(cx, coord, cz);
          sliceHelperGroup.rotation.set(Math.PI / 2, 0, 0);
          sliceHelperGroup.scale.set(sizeX + pad, sizeZ + pad, 1);
        }

        sliceHelperGroup.visible = state.sliceConfig.showPlaneHelper;
        anatomicalRoot.updateMatrixWorld(true);
        clipPlane.copy(localPlane).applyMatrix4(anatomicalRoot.matrixWorld);
      } else {
        sliceHelperGroup.visible = false;
      }

      /* --- E. Project 3D Floating Pins + 2D Screen-Space De-Overlapping --- */
      const pinsRoot = pinsRef.current;
      if (pinsRoot) {
        if (!state.showPins || (state.scrollProgress < 0.05 && !state.isolatedPartId)) {
          pinsRoot.style.display = 'none';
          pinsRoot.style.opacity = '0';
          pinsRoot.style.pointerEvents = 'none';
        } else {
          pinsRoot.style.display = 'block';
          pinsRoot.style.opacity = '1';
          const w = window.innerWidth;
          const h = window.innerHeight;
          const isLab = state.activeChapter === 6 || state.cinemaMode;

          const visiblePins: Array<{ el: HTMLElement; sx: number; sy: number }> = [];
          const pinNodes = pinsRoot.children;

          for (let i = 0; i < pinNodes.length; i++) {
            const el = pinNodes[i] as HTMLElement;
            const pid = el.dataset.partId;
            if (!pid) continue;
            const part = PARTS_BY_ID[pid];
            const grp = allPartGroups[pid];
            if (!part || !grp || !grp.visible) {
              el.style.display = 'none';
              continue;
            }

            const isHigh =
              pid === state.selectedPartId ||
              pid === state.isolatedPartId ||
              chapterHighlights.includes(pid);

            const shouldShow = state.isolatedPartId
              ? pid === state.isolatedPartId
              : isLab
                ? state.layerStates[part.system]?.active
                : isHigh && state.layerStates[part.system]?.active;

            if (!shouldShow) {
              el.style.display = 'none';
              continue;
            }

            const anchor = part.pinAnchor ?? part.center;
            let sideShiftX = 0;
            if (grp.userData.isBilateral) {
              const targetSide = part.pinSide ?? 0;
              for (let ci = 0; ci < grp.children.length; ci++) {
                if (grp.children[ci].userData.bilateralSide === targetSide) {
                  sideShiftX = grp.children[ci].position.x;
                  break;
                }
              }
            }

            projV3.set(
              anchor[0] + grp.position.x + sideShiftX,
              anchor[1] + 2.5 + grp.position.y,
              anchor[2] + grp.position.z
            );
            projV3.applyMatrix4(anatomicalRoot.matrixWorld);
            if (wantClip && pid !== state.isolatedPartId && clipPlane.distanceToPoint(projV3) < -0.04) {
              el.style.display = 'none';
              continue;
            }
            projV3.project(camera);

            if (projV3.z > 1 || projV3.z < -1) {
              el.style.display = 'none';
              continue;
            }

            const sx = (projV3.x * 0.5 + 0.5) * w;
            const sy = (-projV3.y * 0.5 + 0.5) * h;

            if (sx < 24 || sx > w - 24 || sy < 72 || sy > h - 122) {
              el.style.display = 'none';
              continue;
            }

            visiblePins.push({ el, sx, sy });
          }

          // 2-pass screen-space de-overlapping sweep
          visiblePins.sort((a, b) => a.sy - b.sy);
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 1; i < visiblePins.length; i++) {
              const cur = visiblePins[i];
              for (let j = 0; j < i; j++) {
                const prev = visiblePins[j];
                if (Math.abs(cur.sx - prev.sx) < 92 && Math.abs(cur.sy - prev.sy) < 28) {
                  cur.sy = Math.min(h - 124, prev.sy + 29);
                }
              }
            }
          }

          for (const pin of visiblePins) {
            pin.el.style.display = 'inline-flex';
            pin.el.style.left = `${pin.sx.toFixed(1)}px`;
            pin.el.style.top = `${pin.sy.toFixed(1)}px`;
          }
        }
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      hdTriggerRef.current = null;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlStart);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      domEl.removeEventListener('pointermove', handlePointerMove);
      domEl.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('dblclick', handleDoubleClick);
      domEl.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      sculpted.dispose();
      hdMaterialsToDispose.forEach((m) => m.dispose());
      clonedSculptMaterialsToDispose.forEach((m) => m.dispose());
      hdGeometriesToDispose.forEach((g) => g.dispose());
      Object.values(boneMaterialsById).forEach((m) => m.dispose());
      boneBaseMat.dispose();
      skinShellMat.dispose();
      boneMicroTex.dispose();
      organMicroTex.dispose();
      ktx2Set?.dispose();
      envRenderTarget.dispose();
      pmremGenerator.dispose();
      gridHelper.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      sliceFillGeom.dispose();
      sliceFillMat.dispose();
      sliceEdgeGeom.dispose();
      sliceEdgeMat.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, [onModelReady, onModelError]);

  // On-demand streaming whenever user selects or isolates an HD-supported structure
  useEffect(() => {
    const targetId = isolatedPartId ?? selectedPartId;
    if (targetId && HD_PART_CONFIGS[targetId]) {
      void hdTriggerRef.current?.(targetId);
    }
  }, [selectedPartId, isolatedPartId]);

  // Gentle batched async streaming when user clicks HD All preload in dock
  useEffect(() => {
    if (preloadAllHdTick <= 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < HD_PART_IDS.length; i += 2) {
        if (cancelled || !hdTriggerRef.current) break;
        const batch = HD_PART_IDS.slice(i, i + 2);
        await Promise.all(batch.map((id) => hdTriggerRef.current?.(id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadAllHdTick]);

  const hoveredPart = hoveredId ? PARTS_BY_ID[hoveredId] : null;
  const pinList: PinScreenPos[] = ANATOMY_PARTS.filter(
    (p) => p.id !== 'skin_envelope'
  ).map((p) => ({
    id: p.id,
    x: 0,
    y: 0,
    visible: false,
  }));

  return (
    <>
      <div
        id="canvas-viewport"
        ref={mountRef}
        className={hoveredId ? 'hovering-part' : ''}
        aria-label="Interactive 3D Human Anatomy Viewport — Click any structure to inspect, double-click to isolate in 360°"
      />

      {/* X-Ray Fluoroscopy Grid */}
      <div
        className={`xray-grid-overlay ${imagingMode === 'xray' ? 'active' : ''}`}
        aria-hidden="true"
      />

      {/* 3D Projected Part Pins */}
      <div className="pins-overlay" ref={pinsRef}>
        {pinList.map((pin) => {
          const part = PARTS_BY_ID[pin.id];
          const sysColor = SYSTEM_MAP[part.system]?.color ?? '#38bdf8';
          const isSelected =
            selectedPartId === pin.id || isolatedPartId === pin.id;
          return (
            <button
              key={pin.id}
              type="button"
              data-part-id={pin.id}
              className={`anatomy-pin ${isSelected ? 'selected' : ''}`}
              style={{ display: 'none' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPart(pin.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onIsolatePart(pin.id);
              }}
            >
              <span
                className="pin-indicator"
                style={{ backgroundColor: sysColor, boxShadow: `0 0 8px ${sysColor}` }}
              />
              <span>{part.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Live 3D Raycast Hover Tooltip */}
      {hoveredPart && (
        <div
          className="raycast-tooltip"
          style={{
            left: Math.min(window.innerWidth - 295, hoverScreenPos.x + 16),
            top: Math.max(76, hoverScreenPos.y - 16),
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9.5px',
              color: SYSTEM_MAP[hoveredPart.system]?.color ?? '#38bdf8',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '2px',
            }}
          >
            {hoveredPart.systemSublabel}
          </div>
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>
            {hoveredPart.nameEn}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#38bdf8',
              marginTop: '1px',
            }}
          >
            {hoveredPart.nameBn}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: '#94a3b8',
              marginTop: '4px',
            }}
          >
            Click to inspect • Double-click to 360° isolate
          </div>
        </div>
      )}
    </>
  );
};
