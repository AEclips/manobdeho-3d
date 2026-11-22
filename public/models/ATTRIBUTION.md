# 3D Medical Anatomy Data Attribution

The high-resolution on-demand anatomical meshes in `public/models/hd/` are Draco-compressed adaptations of open biomedical 3D datasets derived from **BodyParts3D** © **The Database Center for Life Science (DBCLS)** and packaged via **OrganUI**.

## Dataset & Publications
- **BodyParts3D / Anatomography**: https://lifesciencedb.jp/bp3d/
- **Publication**: Mitsuhashi et al. (2009), *"BodyParts3D: 3D structure database for anatomical concepts"*, Nucleic Acids Research 37 (D782–D785), https://doi.org/10.1093/nar/gkn613
- **OrganUI Explorers (MIT application code / GLB adaptations)**: https://github.com/organui
- **ImliStack Organ Assets Mirror**: https://github.com/ImliStack/Body-Atlas-3D

## Per-Model Licenses
- **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/):
  - `heart.glb`, `cerebrum.glb`, `cerebellum.glb`, `liver.glb`, `kidneys.glb`
- **CC BY-SA 2.1 Japan** (https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en):
  - `lungs.glb`, `stomach.glb`, `intestines.glb`, `cranium.glb`, `mandible.glb`, `thorax.glb`, `spine.glb`, `pelvis.glb`

## Modifications Performed
All upstream meshes were welded, normalized, pruned into region-specific modules, and compressed with `KHR_draco_mesh_compression` using `@gltf-transform` + `draco3dgltf` for fast progressive web streaming. ShareAlike (CC BY-SA) adapted models remain licensed under the same CC BY-SA terms. Educational visualization only — not for clinical diagnosis.
