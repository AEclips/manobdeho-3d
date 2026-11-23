import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, normals, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'models');
const HD_OUT_DIR = path.join(ROOT, 'public', 'models', 'hd');
const BASE_SKEL_PATH = path.join(ROOT, 'public', 'models', 'human-skeleton.glb');
const RAW_SKEL_CACHE = path.join(CACHE_DIR, 'human-skeleton.raw.glb');

const UPSTREAM_URLS = {
  'skeleton-bp3d.glb':
    'https://raw.githubusercontent.com/organui/skeleton-3d/main/public/models/skeleton.glb',
  'heart.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/heart.glb',
  'brain.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/brain.glb',
  'lungs.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/lungs.glb',
  'liver.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/liver.glb',
  'stomach.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/stomach.glb',
  'kidneys.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/kidneys.glb',
  'intestines.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/intestines.glb',
  'eye.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/eye.glb',
  'larynx.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/larynx.glb',
  'esophagus.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/esophagus.glb',
  'pancreas.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/pancreas.glb',
  'spleen.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/spleen.glb',
  'bladder.glb':
    'https://raw.githubusercontent.com/ImliStack/Body-Atlas-3D/main/public/organs/bladder.glb',
};

const DRACO_OPTS = {
  method: 'edgebreaker',
  encodeSpeed: 5,
  decodeSpeed: 5,
  quantizationVolume: 'mesh',
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
};

function countDocGeometry(doc) {
  let triangles = 0;
  const meshes = doc.getRoot().listMeshes();
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() : pos ? pos.getCount() : 0;
      triangles += count / 3;
    }
  }
  return {
    meshes: meshes.length,
    triangles: Math.round(triangles),
  };
}

function disposeMatchingNodes(doc, keepPredicate) {
  const nodes = doc.getRoot().listNodes();
  let kept = 0;
  for (const node of nodes) {
    const name = node.getName() || '';
    if (keepPredicate(name)) {
      kept++;
    } else {
      node.dispose();
    }
  }
  if (kept === 0) {
    throw new Error('Slice predicate matched 0 nodes.');
  }
}

async function ensureDownloaded(filename, url) {
  const dest = path.join(CACHE_DIR, filename);
  if (existsSync(dest)) return dest;
  console.log(`Downloading ${filename} from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${filename}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`Saved ${filename} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  return dest;
}

function cloneBuffer(srcBuf) {
  return new Uint8Array(srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(HD_OUT_DIR, { recursive: true });

  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  // Preserve pristine original skeleton before overwriting public/models/human-skeleton.glb
  if (!existsSync(RAW_SKEL_CACHE)) {
    await copyFile(BASE_SKEL_PATH, RAW_SKEL_CACHE);
    console.log('Backed up pristine skeleton GLB to .cache/models/human-skeleton.raw.glb');
  }

  // Ensure all upstream medical models are cached locally
  await Promise.all(
    Object.entries(UPSTREAM_URLS).map(([file, url]) => ensureDownloaded(file, url))
  );

  // 1. Base Skeleton: Weld flat vertices, compute smooth normals, and Draco-compress
  const rawSkelStat = await stat(RAW_SKEL_CACHE);
  const baseDoc = await io.read(RAW_SKEL_CACHE);
  await baseDoc.transform(
    dedup(),
    weld({ tolerance: 1e-4 }),
    normals({ overwrite: true }),
    prune(),
    draco(DRACO_OPTS)
  );
  await io.write(BASE_SKEL_PATH, baseDoc);
  const compSkelStat = await stat(BASE_SKEL_PATH);
  const baseGeo = countDocGeometry(baseDoc);
  console.log(
    `Base skeleton: ${(rawSkelStat.size / 1024 / 1024).toFixed(2)} MB -> ${(compSkelStat.size / 1024).toFixed(0)} KB (${baseGeo.triangles.toLocaleString()} tris, smooth normals + Draco)`
  );

  const partsManifest = {};

  async function processSingle({
    partId,
    sourceFile,
    outFile,
    sourceLabel,
    license,
    keepPredicate,
    recomputeNormals = false,
  }) {
    const srcPath = path.join(CACHE_DIR, sourceFile);
    const outPath = path.join(HD_OUT_DIR, outFile);
    const rawBuf = await readFile(srcPath);
    const doc = await io.readBinary(cloneBuffer(rawBuf));

    if (keepPredicate) {
      disposeMatchingNodes(doc, keepPredicate);
    }

    await doc.transform(
      dedup(),
      weld({ tolerance: 1e-5 }),
      normals({ overwrite: recomputeNormals }),
      prune(),
      draco(DRACO_OPTS)
    );

    const geo = countDocGeometry(doc);
    if (geo.meshes === 0 || geo.triangles < 500) {
      throw new Error(
        `Slice validation failed for ${partId} (${outFile}): meshes=${geo.meshes}, triangles=${geo.triangles}`
      );
    }

    await io.write(outPath, doc);
    const outStat = await stat(outPath);

    partsManifest[partId] = {
      file: outFile,
      source: sourceLabel,
      license,
      triangles: geo.triangles,
      meshes: geo.meshes,
      rawBytes: rawBuf.length,
      compressedBytes: outStat.size,
    };

    console.log(
      `[HD] ${partId.padEnd(22)} -> ${outFile.padEnd(16)} ${(outStat.size / 1024).toFixed(1).padStart(6)} KB | ${geo.triangles.toLocaleString().padStart(7)} tris | ${geo.meshes} meshes`
    );
  }

  // 2. Medical High-Poly Visceral & Neural Organs (BodyParts3D / OrganUI)
  const CEREBELLUM_NODES = new Set([
    'cerebellum',
    'midbrain',
    'pons',
    'medulla',
    'cerebral-aqueduct',
    'fourth-ventricle',
  ]);

  await processSingle({
    partId: 'organ_heart',
    sourceFile: 'heart.glb',
    outFile: 'heart.glb',
    sourceLabel: 'BodyParts3D / OrganUI heart-3d (11 cardiac structures)',
    license: 'CC BY 4.0',
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_brain_cerebrum',
    sourceFile: 'brain.glb',
    outFile: 'cerebrum.glb',
    sourceLabel: 'BodyParts3D / OrganUI brain-3d (Cortical lobes, limbic & ventricles)',
    license: 'CC BY 4.0',
    keepPredicate: (name) => !CEREBELLUM_NODES.has(name),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_brain_cerebellum',
    sourceFile: 'brain.glb',
    outFile: 'cerebellum.glb',
    sourceLabel: 'BodyParts3D / OrganUI brain-3d (Cerebellum, Midbrain, Pons, Medulla)',
    license: 'CC BY 4.0',
    keepPredicate: (name) => CEREBELLUM_NODES.has(name),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_lungs',
    sourceFile: 'lungs.glb',
    outFile: 'lungs.glb',
    sourceLabel: 'BodyParts3D / OrganUI lungs-3d (Pulmonary lobes & bronchial tree)',
    license: 'CC BY-SA 2.1 JP',
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_liver',
    sourceFile: 'liver.glb',
    outFile: 'liver.glb',
    sourceLabel: 'BodyParts3D / OrganUI liver-3d (Liver, Gallbladder, Portal & Hepatic ducts)',
    license: 'CC BY 4.0',
    recomputeNormals: false,
  });

  const STOMACH_NODES = new Set([
    'stomach',
    'duodenum',
    'left-gastric-artery',
    'common-hepatic-artery',
    'celiac-trunk',
  ]);

  await processSingle({
    partId: 'organ_stomach',
    sourceFile: 'stomach.glb',
    outFile: 'stomach.glb',
    sourceLabel: 'BodyParts3D / OrganUI stomach-3d (Gastric chamber, duodenum & arterial supply)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (name) => STOMACH_NODES.has(name),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_kidneys',
    sourceFile: 'kidneys.glb',
    outFile: 'kidneys.glb',
    sourceLabel: 'BodyParts3D / OrganUI kidneys-3d (Kidneys, Ureters & Renal arteries)',
    license: 'CC BY 4.0',
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_intestines',
    sourceFile: 'intestines.glb',
    outFile: 'intestines.glb',
    sourceLabel: 'BodyParts3D / OrganUI intestines-3d (Small & Large Intestines)',
    license: 'CC BY-SA 2.1 JP',
    recomputeNormals: false,
  });

  // 2B. 6 Newly Integrated Medical High-Poly Organs
  const EYE_EXCLUDE = new Set([
    'upper-tarsal-plate',
    'lower-tarsal-plate',
    'lacrimal-gland',
    'levator-palpebrae',
    'trochlea',
  ]);
  await processSingle({
    partId: 'organ_eyes',
    sourceFile: 'eye.glb',
    outFile: 'eye.glb',
    sourceLabel: 'BodyParts3D / OrganUI eye-3d (Globe, Cornea, Lens, Retina, Optic Nerve & 6 Muscles)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => !EYE_EXCLUDE.has(n),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'organ_larynx',
    sourceFile: 'larynx.glb',
    outFile: 'larynx.glb',
    sourceLabel: 'BodyParts3D / OrganUI larynx-3d (Thyroid/Cricoid Cartilages, Epiglottis & Vocal Cords)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => n !== 'trachea',
    recomputeNormals: false,
  });

  const ESOPHAGUS_NODES = new Set([
    'esophagus',
    'esophageal-arteries',
    'right-vagus-nerve',
    'left-vagus-nerve',
  ]);
  await processSingle({
    partId: 'organ_esophagus',
    sourceFile: 'esophagus.glb',
    outFile: 'esophagus.glb',
    sourceLabel: 'BodyParts3D / OrganUI esophagus-3d (Esophageal Tube, Arteries & Vagal Plexus)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => ESOPHAGUS_NODES.has(n),
    recomputeNormals: false,
  });

  const PANCREAS_NODES = new Set([
    'pancreas',
    'pancreatic-duct',
    'pancreatic-arteries',
    'pancreaticoduodenal-arteries',
    'pancreaticoduodenal-veins',
  ]);
  await processSingle({
    partId: 'organ_pancreas',
    sourceFile: 'pancreas.glb',
    outFile: 'pancreas.glb',
    sourceLabel: 'BodyParts3D / OrganUI pancreas-3d (Pancreas, Wirsung Duct & Vascular Arcades)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => PANCREAS_NODES.has(n),
    recomputeNormals: false,
  });

  const SPLEEN_NODES = new Set(['spleen', 'splenic-artery', 'splenic-vein']);
  await processSingle({
    partId: 'organ_spleen',
    sourceFile: 'spleen.glb',
    outFile: 'spleen.glb',
    sourceLabel: 'BodyParts3D / OrganUI spleen-3d (Splenic Parenchyma & Hilum Vessels)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => SPLEEN_NODES.has(n),
    recomputeNormals: false,
  });

  const BLADDER_NODES = new Set([
    'urinary-bladder',
    'urethra',
    'prostate',
    'right-seminal-vesicle',
    'left-seminal-vesicle',
  ]);
  await processSingle({
    partId: 'organ_bladder',
    sourceFile: 'bladder.glb',
    outFile: 'bladder.glb',
    sourceLabel: 'BodyParts3D / OrganUI bladder-3d (Urinary Bladder, Urethra & Pelvic Outlet)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => BLADDER_NODES.has(n),
    recomputeNormals: false,
  });

  // 3. Complete 242-Bone Medical High-Poly Skeleton (5 Axial + 14 Appendicular Limb Regions)
  const CRANIUM_RE =
    /^(frontal-bone|.*parietal-bone|occipital-bone|.*temporal-bone|sphenoid-bone|ethmoid-bone|.*nasal-bone|.*lacrimal-bone|.*zygomatic-bone|.*maxilla|.*palatine-bone|.*inferior-nasal-concha|vomer)$/;
  const MANDIBLE_RE = /^mandible$/;
  const THORAX_RE = /^(manubrium-of-sternum|body-of-sternum|xiphoid-process|.*-(rib|costal-cartilage|costal-cartilages))$/;
  const SPINE_RE = /^(atlas-c1|axis-c2|.*-(cervical|thoracic|lumbar)-vertebra.*|intervertebral-disc-.*)$/;
  const PELVIS_RE = /^(sacrum|right-hip-bone|left-hip-bone)$/;

  await processSingle({
    partId: 'SM_HumanSkeleton_17',
    sourceFile: 'skeleton-bp3d.glb',
    outFile: 'cranium.glb',
    sourceLabel: 'BodyParts3D / OrganUI skeleton-3d (21 Cranial & Facial Bones)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => CRANIUM_RE.test(n),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'SM_HumanSkeleton_18',
    sourceFile: 'skeleton-bp3d.glb',
    outFile: 'mandible.glb',
    sourceLabel: 'BodyParts3D / OrganUI skeleton-3d (Mandible)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => MANDIBLE_RE.test(n),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'SM_HumanSkeleton_08',
    sourceFile: 'skeleton-bp3d.glb',
    outFile: 'thorax.glb',
    sourceLabel: 'BodyParts3D / OrganUI skeleton-3d (Sternum, 24 Ribs & Costal Cartilages)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => THORAX_RE.test(n),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'SM_HumanSkeleton_20',
    sourceFile: 'skeleton-bp3d.glb',
    outFile: 'spine.glb',
    sourceLabel: 'BodyParts3D / OrganUI skeleton-3d (Vertebral Column & Intervertebral Discs)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => SPINE_RE.test(n),
    recomputeNormals: false,
  });

  await processSingle({
    partId: 'SM_HumanSkeleton_16',
    sourceFile: 'skeleton-bp3d.glb',
    outFile: 'pelvis.glb',
    sourceLabel: 'BodyParts3D / OrganUI skeleton-3d (Sacrum & Bilateral Hip Bones)',
    license: 'CC BY-SA 2.1 JP',
    keepPredicate: (n) => PELVIS_RE.test(n),
    recomputeNormals: false,
  });

  // 3B. Remaining 14 Appendicular Upper & Lower Limb Skeletal Assemblies
  const appendicularSlices = [
    {
      partId: 'SM_HumanSkeleton_15',
      outFile: 'r-shoulder.glb',
      label: 'Right Clavicle & Scapula',
      re: /^right-(clavicle|scapula)$/,
    },
    {
      partId: 'SM_HumanSkeleton_13',
      outFile: 'l-shoulder.glb',
      label: 'Left Clavicle & Scapula',
      re: /^left-(clavicle|scapula)$/,
    },
    {
      partId: 'SM_HumanSkeleton_10',
      outFile: 'r-humerus.glb',
      label: 'Right Humerus',
      re: /^right-humerus$/,
    },
    {
      partId: 'SM_HumanSkeleton_12',
      outFile: 'l-humerus.glb',
      label: 'Left Humerus',
      re: /^left-humerus$/,
    },
    {
      partId: 'SM_HumanSkeleton_02',
      outFile: 'r-forearm.glb',
      label: 'Right Radius & Ulna',
      re: /^right-(radius|ulna)$/,
    },
    {
      partId: 'SM_HumanSkeleton_01',
      outFile: 'l-forearm.glb',
      label: 'Left Radius & Ulna',
      re: /^left-(radius|ulna)$/,
    },
    {
      partId: 'SM_HumanSkeleton_19',
      outFile: 'r-hand.glb',
      label: 'Right 27-Bone Carpus, Metacarpals & Phalanges',
      re: /^right-(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|.*metacarpal.*|.*finger.*|thumb-.*)$/,
    },
    {
      partId: 'SM_HumanSkeleton_14',
      outFile: 'l-hand.glb',
      label: 'Left 27-Bone Carpus, Metacarpals & Phalanges',
      re: /^left-(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|.*metacarpal.*|.*finger.*|thumb-.*)$/,
    },
    {
      partId: 'SM_HumanSkeleton_04',
      outFile: 'r-femur.glb',
      label: 'Right Femur & Patella',
      re: /^right-(femur|patella)$/,
    },
    {
      partId: 'SM_HumanSkeleton_05',
      outFile: 'l-femur.glb',
      label: 'Left Femur & Patella',
      re: /^left-(femur|patella)$/,
    },
    {
      partId: 'SM_HumanSkeleton_07',
      outFile: 'r-shin.glb',
      label: 'Right Tibia & Fibula',
      re: /^right-(tibia|fibula)$/,
    },
    {
      partId: 'SM_HumanSkeleton_06',
      outFile: 'l-shin.glb',
      label: 'Left Tibia & Fibula',
      re: /^left-(tibia|fibula)$/,
    },
    {
      partId: 'SM_HumanSkeleton_09',
      outFile: 'r-foot.glb',
      label: 'Right 26-Bone Tarsus, Metatarsals & Toes',
      re: /^right-(talus|calcaneus|navicular|cuboid|.*cuneiform|.*metatarsal.*|.*toe.*|sesamoid-bones-of-the-foot)$/,
    },
    {
      partId: 'SM_HumanSkeleton_03',
      outFile: 'l-foot.glb',
      label: 'Left 26-Bone Tarsus, Metatarsals & Toes',
      re: /^left-(talus|calcaneus|navicular|cuboid|.*cuneiform|.*metatarsal.*|.*toe.*|sesamoid-bones-of-the-foot)$/,
    },
  ];

  for (const s of appendicularSlices) {
    await processSingle({
      partId: s.partId,
      sourceFile: 'skeleton-bp3d.glb',
      outFile: s.outFile,
      sourceLabel: `BodyParts3D / OrganUI skeleton-3d (${s.label})`,
      license: 'CC BY-SA 2.1 JP',
      keepPredicate: (n) => s.re.test(n),
      recomputeNormals: false,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseSkeleton: {
      rawBytes: rawSkelStat.size,
      compressedBytes: compSkelStat.size,
      triangles: baseGeo.triangles,
      meshes: baseGeo.meshes,
    },
    parts: partsManifest,
  };

  await writeFile(
    path.join(HD_OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  const totalHdBytes = Object.values(partsManifest).reduce(
    (sum, e) => sum + e.compressedBytes,
    0
  );
  const totalHdTris = Object.values(partsManifest).reduce(
    (sum, e) => sum + e.triangles,
    0
  );

  const attribution = `# 3D Medical Anatomy Data Attribution

The high-resolution on-demand anatomical meshes in \`public/models/hd/\` are Draco-compressed adaptations of open biomedical 3D datasets derived from **BodyParts3D** © **The Database Center for Life Science (DBCLS)** and packaged via **OrganUI**.

## Dataset & Publications
- **BodyParts3D / Anatomography**: https://lifesciencedb.jp/bp3d/
- **Publication**: Mitsuhashi et al. (2009), *"BodyParts3D: 3D structure database for anatomical concepts"*, Nucleic Acids Research 37 (D782–D785), https://doi.org/10.1093/nar/gkn613
- **OrganUI Explorers (MIT application code / GLB adaptations)**: https://github.com/organui
- **ImliStack Organ Assets Mirror**: https://github.com/ImliStack/Body-Atlas-3D

## Per-Model Licenses
- **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/):
  - \`heart.glb\`, \`cerebrum.glb\`, \`cerebellum.glb\`, \`liver.glb\`, \`kidneys.glb\`
- **CC BY-SA 2.1 Japan** (https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en):
  - \`lungs.glb\`, \`stomach.glb\`, \`intestines.glb\`, \`eye.glb\`, \`larynx.glb\`, \`esophagus.glb\`, \`pancreas.glb\`, \`spleen.glb\`, \`bladder.glb\`, and all 19 full-skeleton regions (\`cranium.glb\`, \`mandible.glb\`, \`thorax.glb\`, \`spine.glb\`, \`pelvis.glb\`, \`r/l-shoulder.glb\`, \`r/l-humerus.glb\`, \`r/l-forearm.glb\`, \`r/l-hand.glb\`, \`r/l-femur.glb\`, \`r/l-shin.glb\`, \`r/l-foot.glb\`)

## Modifications Performed
All upstream meshes were welded, normalized, pruned into region-specific modules, and compressed with \`KHR_draco_mesh_compression\` using \`@gltf-transform\` + \`draco3dgltf\` for fast progressive web streaming. ShareAlike (CC BY-SA) adapted models remain licensed under the same CC BY-SA terms. Educational visualization only — not for clinical diagnosis.
`;

  await writeFile(
    path.join(ROOT, 'public', 'models', 'ATTRIBUTION.md'),
    attribution,
    'utf8'
  );

  console.log(
    `\nAsset pipeline complete: ${Object.keys(partsManifest).length} HD modules | Total ${(totalHdBytes / 1024 / 1024).toFixed(2)} MB | ${totalHdTris.toLocaleString()} total triangles.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
