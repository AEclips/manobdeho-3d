import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export interface Ktx2PbrTextureSet {
  boneNormal: THREE.CompressedTexture;
  boneRoughness: THREE.CompressedTexture;
  organNormal: THREE.CompressedTexture;
  organRoughness: THREE.CompressedTexture;
  muscleNormal: THREE.CompressedTexture;
  dispose: () => void;
}

/**
 * Creates a Three.js KTX2Loader backed by the local Basis Universal WASM transcoder.
 */
export function createKtx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  const loader = new KTX2Loader();
  loader.setTranscoderPath(`${import.meta.env.BASE_URL}basis/`);
  loader.detectSupport(renderer);
  return loader;
}

function configureLinearKtx2(
  tex: THREE.CompressedTexture,
  anisotropy: number
): THREE.CompressedTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Asynchronously streams and GPU-transcodes all 5 Basis Universal UASTC KTX2 PBR maps.
 */
export async function loadKtx2PbrTextures(
  renderer: THREE.WebGLRenderer
): Promise<Ktx2PbrTextureSet | null> {
  const loader = createKtx2Loader(renderer);
  const base = `${import.meta.env.BASE_URL}textures/ktx2/`;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  try {
    const [boneNormal, boneRoughness, organNormal, organRoughness, muscleNormal] =
      await Promise.all([
        loader.loadAsync(`${base}bone-normal.ktx2`),
        loader.loadAsync(`${base}bone-roughness.ktx2`),
        loader.loadAsync(`${base}organ-normal.ktx2`),
        loader.loadAsync(`${base}organ-roughness.ktx2`),
        loader.loadAsync(`${base}muscle-normal.ktx2`),
      ]);

    const textures = [
      boneNormal,
      boneRoughness,
      organNormal,
      organRoughness,
      muscleNormal,
    ].map((t) => configureLinearKtx2(t, maxAniso));

    return {
      boneNormal: textures[0],
      boneRoughness: textures[1],
      organNormal: textures[2],
      organRoughness: textures[3],
      muscleNormal: textures[4],
      dispose: () => {
        textures.forEach((t) => t.dispose());
        loader.dispose();
      },
    };
  } catch (err) {
    console.warn('KTX2 PBR texture load failed; keeping procedural fallback:', err);
    loader.dispose();
    return null;
  }
}
