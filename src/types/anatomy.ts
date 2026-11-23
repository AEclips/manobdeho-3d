export type SystemId =
  | 'skeletal'
  | 'organs'
  | 'nervous'
  | 'vascular'
  | 'muscular'
  | 'skin';

export type DissectionMode = 'regional' | 'peel';

export type ImagingMode = 'realistic' | 'xray' | 'neurovascular';

export type SliceAxis = 'axial' | 'sagittal' | 'coronal';

export interface SliceConfig {
  enabled: boolean;
  axis: SliceAxis;
  /** Normalized plane depth in [0.02, 0.98] across active scene bounds */
  position: number;
  invert: boolean;
  showPlaneHelper: boolean;
}

export type CameraPreset =
  | 'default'
  | 'anterior'
  | 'posterior'
  | 'left'
  | 'right'
  | 'superior';

export interface SystemConfig {
  id: SystemId;
  nameEn: string;
  nameBn: string;
  countLabel: string;
  color: string;
  defaultActive: boolean;
  defaultOpacity: number;
  peelOffset: [number, number, number];
}

export interface AnatomyPart {
  id: string;
  glbMeshName?: string;
  nameEn: string;
  nameBn: string;
  shortLabel: string;
  latinName: string;
  system: SystemId;
  systemSublabel: string;
  chapter: number;
  center: [number, number, number];
  pinAnchor?: [number, number, number];
  pinSide?: -1 | 0 | 1;
  explodeOffset: [number, number, number];
  explodeRot: [number, number, number];
  stagger: [number, number];
  isolateDistance: number;
  summaryBn: string;
  summaryEn: string;
  functions: string[];
  bloodSupply: {
    arterial: string;
    venous: string;
  };
  innervation: string;
  specs: Record<string, string>;
  clinicalPathology: string[];
}

export interface ChapterConfig {
  id: number;
  code: string;
  navLabel: string;
  titleEn: string;
  titleBn: string;
  subtitleEn: string;
  descriptionBn: string;
  range: [number, number];
  cam: [number, number, number];
  look: [number, number, number];
  metrics: { label: string; value: string }[];
  highlights: string[];
}
