import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type HdPartStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type HdMaterialProfile =
  | 'bone'
  | 'heart'
  | 'brain'
  | 'lung'
  | 'liver'
  | 'stomach'
  | 'kidney'
  | 'intestine';

export interface HdPartConfig {
  file: string;
  profile: HdMaterialProfile;
  bilateral?: boolean;
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
 * Mapping of selectable anatomy part IDs to their Draco-compressed high-poly
 * medical GLB files served lazily on demand from `public/models/hd/`.
 */
export const HD_PART_CONFIGS: Record<string, HdPartConfig> = {
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
  SM_HumanSkeleton_17: {
    file: 'cranium.glb',
    profile: 'bone',
    scaleFit: 1.01,
  },
  SM_HumanSkeleton_18: {
    file: 'mandible.glb',
    profile: 'bone',
    scaleFit: 1.0,
  },
  SM_HumanSkeleton_08: {
    file: 'thorax.glb',
    profile: 'bone',
    scaleFit: 1.01,
  },
  SM_HumanSkeleton_20: {
    file: 'spine.glb',
    profile: 'bone',
    scaleFit: 1.0,
  },
  SM_HumanSkeleton_16: {
    file: 'pelvis.glb',
    profile: 'bone',
    scaleFit: 1.0,
  },
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
 * Creates a deterministic tiled surface micro-bump texture for cortical bone
 * pores or moist organic visceral surfaces without extra network requests.
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
          // Subtle trabecular / Haversian cortical surface grain
          delta =
            Math.sin(x * 0.45 + Math.cos(y * 0.35) * 1.4) * 14 +
            Math.cos(y * 0.72 - x * 0.18) * 10;
        } else {
          // Fine serosal lobular micro-texture for visceral organs
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
 * Upgrades upstream BodyParts3D standard materials into clinically shaded PBR
 * physical materials while keeping original anatomical color differentiation.
 */
export function upgradeHdOrganMaterial(
  srcMat: THREE.Material | THREE.Material[],
  profile: HdMaterialProfile,
  organBumpTex: THREE.Texture
): THREE.MeshPhysicalMaterial {
  const first = Array.isArray(srcMat) ? srcMat[0] : srcMat;
  const std = first as THREE.MeshStandardMaterial;
  const baseColor = std?.color ? std.color.clone() : new THREE.Color(0xd99b96);
  const darkTint = baseColor.clone().multiplyScalar(0.18);

  const profileSpec: Record<
    Exclude<HdMaterialProfile, 'bone'>,
    { roughness: number; clearcoat: number; bumpScale: number }
  > = {
    heart: { roughness: 0.28, clearcoat: 0.65, bumpScale: 0.035 },
    brain: { roughness: 0.4, clearcoat: 0.42, bumpScale: 0.03 },
    lung: { roughness: 0.52, clearcoat: 0.24, bumpScale: 0.04 },
    liver: { roughness: 0.25, clearcoat: 0.62, bumpScale: 0.03 },
    stomach: { roughness: 0.36, clearcoat: 0.45, bumpScale: 0.035 },
    kidney: { roughness: 0.26, clearcoat: 0.6, bumpScale: 0.03 },
    intestine: { roughness: 0.38, clearcoat: 0.42, bumpScale: 0.035 },
  };

  const spec = profileSpec[profile === 'bone' ? 'heart' : profile];
  return new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: darkTint,
    emissiveIntensity: 0.22,
    roughness: spec.roughness,
    metalness: 0.03,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: 0.28,
    bumpMap: organBumpTex,
    bumpScale: spec.bumpScale,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
  });
}
