import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Ktx2PbrTextureSet } from './Ktx2PbrManager';

export type HdPartStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type HdMaterialProfile =
  | 'bone'
  | 'heart'
  | 'brain'
  | 'eye'
  | 'larynx'
  | 'esophagus'
  | 'lung'
  | 'liver'
  | 'stomach'
  | 'pancreas'
  | 'spleen'
  | 'kidney'
  | 'intestine'
  | 'bladder';

export interface HdPartConfig {
  file: string;
  profile: HdMaterialProfile;
  bilateral?: boolean;
  mirrorPair?: boolean;
  mountInHeartPivot?: boolean;
  scaleFit?: number;
  rotY?: number;
}

export interface HdManifestEntry {
  file: string;
  source: string;
  license: string;
  triangles: number;
  meshes: number;
  rawBytes: number;
  compressedBytes: number;
}

export interface HdManifest {
  generatedAt: string;
  baseSkeleton: {
    rawBytes: number;
    compressedBytes: number;
    triangles: number;
    meshes: number;
  };
  parts: Record<string, HdManifestEntry>;
}

/**
 * Mapping of all 33 selectable anatomy part IDs (19 full-skeleton modules +
 * 14 medical organs) to Draco-compressed GLBs served strictly on demand.
 */
export const HD_PART_CONFIGS: Record<string, HdPartConfig> = {
  // 14 Medical High-Poly Visceral, Neural & Sensory Organs
  organ_heart: {
    file: 'heart.glb',
    profile: 'heart',
    mountInHeartPivot: true,
    scaleFit: 1.06,
  },
  organ_brain_cerebrum: {
    file: 'cerebrum.glb',
    profile: 'brain',
    scaleFit: 0.88,
  },
  organ_brain_cerebellum: {
    file: 'cerebellum.glb',
    profile: 'brain',
    scaleFit: 0.92,
  },
  organ_eyes: {
    file: 'eye.glb',
    profile: 'eye',
    bilateral: true,
    mirrorPair: true,
    scaleFit: 0.92,
  },
  organ_larynx: {
    file: 'larynx.glb',
    profile: 'larynx',
    scaleFit: 0.98,
  },
  organ_esophagus: {
    file: 'esophagus.glb',
    profile: 'esophagus',
    scaleFit: 1.0,
  },
  organ_lungs: {
    file: 'lungs.glb',
    profile: 'lung',
    bilateral: true,
    scaleFit: 1.04,
  },
  organ_liver: {
    file: 'liver.glb',
    profile: 'liver',
    scaleFit: 1.04,
  },
  organ_stomach: {
    file: 'stomach.glb',
    profile: 'stomach',
    scaleFit: 1.03,
  },
  organ_pancreas: {
    file: 'pancreas.glb',
    profile: 'pancreas',
    scaleFit: 1.02,
  },
  organ_spleen: {
    file: 'spleen.glb',
    profile: 'spleen',
    scaleFit: 1.02,
  },
  organ_kidneys: {
    file: 'kidneys.glb',
    profile: 'kidney',
    bilateral: true,
    scaleFit: 1.02,
  },
  organ_intestines: {
    file: 'intestines.glb',
    profile: 'intestine',
    scaleFit: 1.02,
  },
  organ_bladder: {
    file: 'bladder.glb',
    profile: 'bladder',
    scaleFit: 0.98,
  },

  // 19 High-Poly BodyParts3D Skeletal Regions (Full 242-Bone Coverage)
  SM_HumanSkeleton_17: { file: 'cranium.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_18: { file: 'mandible.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_08: { file: 'thorax.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_20: { file: 'spine.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_16: { file: 'pelvis.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_15: { file: 'r-shoulder.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_13: { file: 'l-shoulder.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_10: { file: 'r-humerus.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_12: { file: 'l-humerus.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_02: { file: 'r-forearm.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_01: { file: 'l-forearm.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_19: { file: 'r-hand.glb', profile: 'bone', scaleFit: 1.02 },
  SM_HumanSkeleton_14: { file: 'l-hand.glb', profile: 'bone', scaleFit: 1.02 },
  SM_HumanSkeleton_04: { file: 'r-femur.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_05: { file: 'l-femur.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_07: { file: 'r-shin.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_06: { file: 'l-shin.glb', profile: 'bone', scaleFit: 1.0 },
  SM_HumanSkeleton_09: { file: 'r-foot.glb', profile: 'bone', scaleFit: 1.01 },
  SM_HumanSkeleton_03: { file: 'l-foot.glb', profile: 'bone', scaleFit: 1.01 },
};

export const HD_PART_IDS = Object.keys(HD_PART_CONFIGS);

let sharedDracoLoader: DRACOLoader | null = null;

function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    sharedDracoLoader.setDecoderConfig({ type: 'wasm' });
    sharedDracoLoader.preload();
  }
  return sharedDracoLoader;
}

/**
 * Returns a configured GLTFLoader supporting local WASM Draco decoding and Meshopt fallback.
 */
export function createDracoGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getSharedDracoLoader());
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

let manifestPromise: Promise<HdManifest | null> | null = null;

export function fetchHdManifest(): Promise<HdManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${import.meta.env.BASE_URL}models/hd/manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<HdManifest>) : null))
      .catch(() => null);
  }
  return manifestPromise;
}

const sceneTemplateCache = new Map<string, THREE.Group>();
const inFlightLoads = new Map<string, Promise<THREE.Group>>();

/**
 * Streams a Draco-compressed high-poly anatomical GLB strictly on demand.
 * Deduplicates concurrent requests and caches parsed templates in memory.
 */
export function loadHdPartScene(partId: string): Promise<THREE.Group> {
  const cfg = HD_PART_CONFIGS[partId];
  if (!cfg) {
    return Promise.reject(new Error(`No HD asset configured for ${partId}`));
  }

  const cached = sceneTemplateCache.get(partId);
  if (cached) {
    return Promise.resolve(cached);
  }

  const existingPromise = inFlightLoads.get(partId);
  if (existingPromise) {
    return existingPromise;
  }

  const loader = createDracoGltfLoader();
  const url = `${import.meta.env.BASE_URL}models/hd/${cfg.file}`;

  const loadPromise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        sceneTemplateCache.set(partId, gltf.scene);
        inFlightLoads.delete(partId);
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        inFlightLoads.delete(partId);
        reject(err instanceof Error ? err : new Error(`Failed loading HD model ${cfg.file}`));
      }
    );
  });

  inFlightLoads.set(partId, loadPromise);
  return loadPromise;
}

/**
 * Ensures any BufferGeometry lacking `TEXCOORD_0` UVs gets clean object-space
 * triplanar box-projected UVs so GPU-compressed KTX2 normal & roughness maps tile evenly.
 */
export function ensureBoxUVs(root: THREE.Object3D, uvScale = 1.6): void {
  const sizeVec = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry;
    if (!geom || geom.attributes.uv) return;

    const posAttr = geom.attributes.position;
    if (!posAttr) return;
    if (!geom.attributes.normal) {
      geom.computeVertexNormals();
    }
    const normAttr = geom.attributes.normal;
    if (!geom.boundingBox) {
      geom.computeBoundingBox();
    }
    geom.boundingBox?.getSize(sizeVec);
    const invExtent =
      uvScale / Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1e-4);

    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      vPos.fromBufferAttribute(posAttr, i);
      vNorm.fromBufferAttribute(normAttr, i);
      const ax = Math.abs(vNorm.x);
      const ay = Math.abs(vNorm.y);
      const az = Math.abs(vNorm.z);

      let u = 0;
      let v = 0;
      if (ax >= ay && ax >= az) {
        u = vPos.z * invExtent;
        v = vPos.y * invExtent;
      } else if (ay >= ax && ay >= az) {
        u = vPos.x * invExtent;
        v = vPos.z * invExtent;
      } else {
        u = vPos.x * invExtent;
        v = vPos.y * invExtent;
      }
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }

    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  });
}

/**
 * Mirrors an Object3D's cloned BufferGeometries across X while reversing triangle
 * winding order so normals stay outward-facing for bilateral anatomy (e.g. Left Eye).
 */
export function mirrorObjectGeometryX(
  root: THREE.Object3D,
  outGeometries?: THREE.BufferGeometry[]
): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry.clone();
    outGeometries?.push(geom);
    const pos = geom.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, -pos.getX(i));
      }
      pos.needsUpdate = true;
    }
    const idx = geom.getIndex();
    if (idx) {
      const arr = idx.array as Uint16Array | Uint32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const tmp = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = tmp;
      }
      idx.needsUpdate = true;
    } else if (pos) {
      for (let i = 0; i < pos.count; i += 3) {
        const x1 = pos.getX(i + 1);
        const y1 = pos.getY(i + 1);
        const z1 = pos.getZ(i + 1);
        pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        pos.setXYZ(i + 2, x1, y1, z1);
      }
      pos.needsUpdate = true;
    }
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    mesh.geometry = geom;
  });
}

/**
 * Creates a deterministic tiled surface micro-bump texture used immediately
 * while GPU-compressed KTX2 PBR normal/roughness maps finish loading.
 */
export function createMicroBumpTexture(kind: 'bone' | 'organ'): THREE.CanvasTexture {
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
        let delta = 0;
        if (kind === 'bone') {
          delta =
            Math.sin(x * 0.45 + Math.cos(y * 0.35) * 1.4) * 14 +
            Math.cos(y * 0.72 - x * 0.18) * 10;
        } else {
          delta =
            Math.sin(x * 0.32) * Math.cos(y * 0.32) * 18 +
            Math.sin((x + y) * 0.58) * 9;
        }
        const v = Math.max(0, Math.min(255, Math.round(128 + delta)));
        const i = (y * size + x) * 4;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'bone' ? 4 : 3, kind === 'bone' ? 4 : 3);
  return tex;
}

/**
 * Upgrades upstream BodyParts3D materials into clinically shaded PBR physical
 * materials using GPU-compressed KTX2 normal & roughness maps when ready.
 */
export function upgradeHdOrganMaterial(
  srcMat: THREE.Material | THREE.Material[],
  profile: HdMaterialProfile,
  organBumpTex: THREE.Texture,
  ktx2?: Ktx2PbrTextureSet | null
): THREE.MeshPhysicalMaterial {
  const first = Array.isArray(srcMat) ? srcMat[0] : srcMat;
  const std = first as THREE.MeshStandardMaterial;
  const baseColor = std?.color ? std.color.clone() : new THREE.Color(0xd99b96);
  const darkTint = baseColor.clone().multiplyScalar(0.18);

  const profileSpec: Record<
    Exclude<HdMaterialProfile, 'bone'>,
    { roughness: number; clearcoat: number; bumpScale: number; normalScale: number }
  > = {
    heart: { roughness: 0.28, clearcoat: 0.65, bumpScale: 0.035, normalScale: 0.3 },
    brain: { roughness: 0.4, clearcoat: 0.42, bumpScale: 0.03, normalScale: 0.26 },
    eye: { roughness: 0.16, clearcoat: 0.85, bumpScale: 0.015, normalScale: 0.16 },
    larynx: { roughness: 0.36, clearcoat: 0.44, bumpScale: 0.03, normalScale: 0.28 },
    esophagus: { roughness: 0.38, clearcoat: 0.42, bumpScale: 0.035, normalScale: 0.3 },
    lung: { roughness: 0.52, clearcoat: 0.24, bumpScale: 0.04, normalScale: 0.34 },
    liver: { roughness: 0.25, clearcoat: 0.62, bumpScale: 0.03, normalScale: 0.26 },
    stomach: { roughness: 0.36, clearcoat: 0.45, bumpScale: 0.035, normalScale: 0.3 },
    pancreas: { roughness: 0.42, clearcoat: 0.38, bumpScale: 0.038, normalScale: 0.32 },
    spleen: { roughness: 0.28, clearcoat: 0.58, bumpScale: 0.03, normalScale: 0.26 },
    kidney: { roughness: 0.26, clearcoat: 0.6, bumpScale: 0.03, normalScale: 0.26 },
    intestine: { roughness: 0.38, clearcoat: 0.42, bumpScale: 0.035, normalScale: 0.3 },
    bladder: { roughness: 0.34, clearcoat: 0.48, bumpScale: 0.03, normalScale: 0.28 },
  };

  const spec = profileSpec[profile === 'bone' ? 'heart' : profile];
  return new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: darkTint,
    emissiveIntensity: 0.22,
    roughness: spec.roughness,
    metalness: 0.03,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: 0.26,
    normalMap: ktx2 ? ktx2.organNormal : null,
    normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
    roughnessMap: ktx2 ? ktx2.organRoughness : null,
    bumpMap: ktx2 ? null : organBumpTex,
    bumpScale: spec.bumpScale,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
  });
}
