import React from 'react';
import {
  Orbit,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Scan,
  Sparkles,
  Split,
  Tag,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CameraPreset, DissectionMode, ImagingMode } from '../types/anatomy';

interface ViewportDockProps {
  dissectionProgress: number;
  dissectionMode: DissectionMode;
  imagingMode: ImagingMode;
  autoDissect: boolean;
  freeOrbit: boolean;
  autoSpin: boolean;
  showPins: boolean;
  isPlaying: boolean;
  cameraPreset: CameraPreset;
  hasDrawerOpen: boolean;
  hdLoadedCount: number;
  hdTotalCount: number;
  hdLoadingCount: number;
  onManualProgress: (val: number) => void;
  onToggleAutoDissect: () => void;
  onChangeDissectionMode: (mode: DissectionMode) => void;
  onCycleImagingMode: () => void;
  onSelectPreset: (preset: CameraPreset) => void;
  onZoom: (delta: number) => void;
  onToggleOrbit: () => void;
  onToggleAutoSpin: () => void;
  onTogglePins: () => void;
  onTogglePlay: () => void;
  onPreloadAllHd: () => void;
}

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'anterior', label: 'Ant' },
  { id: 'posterior', label: 'Post' },
  { id: 'left', label: 'L' },
  { id: 'right', label: 'R' },
  { id: 'superior', label: 'Top' },
];

export const ViewportDock: React.FC<ViewportDockProps> = ({
  dissectionProgress,
  dissectionMode,
  imagingMode,
  autoDissect,
  freeOrbit,
  autoSpin,
  showPins,
  isPlaying,
  cameraPreset,
  hasDrawerOpen,
  hdLoadedCount,
  hdTotalCount,
  hdLoadingCount,
  onManualProgress,
  onToggleAutoDissect,
  onChangeDissectionMode,
  onCycleImagingMode,
  onSelectPreset,
  onZoom,
  onToggleOrbit,
  onToggleAutoSpin,
  onTogglePins,
  onTogglePlay,
  onPreloadAllHd,
}) => {
  const allHdLoaded = hdTotalCount > 0 && hdLoadedCount >= hdTotalCount;
  const imagingLabel =
    imagingMode === 'realistic'
      ? 'PBR'
      : imagingMode === 'xray'
        ? 'X-Ray'
        : 'Neuro-V';

  return (
    <div
      className={`spatial-dock-wrap ${hasDrawerOpen ? 'with-drawer' : ''}`}
      role="region"
      aria-label="Spatial 3D Control Bar"
    >
      <div className="spatial-dock spatial-glass">
        <div className="spatial-dock-row">
          <button
            type="button"
            className={`spatial-pill-btn ${autoDissect ? 'active' : ''}`}
            onClick={onToggleAutoDissect}
            aria-label={autoDissect ? 'Stop auto-dissect sweep' : 'Play auto-dissect sweep'}
          >
            {autoDissect ? <Pause size={12} /> : <Play size={12} />}
            <span>{autoDissect ? 'Stop' : 'Dissect'}</span>
          </button>

          <div className="spatial-scrubber">
            <input
              type="range"
              className="spatial-range"
              aria-label="Dissection explosion percentage"
              min={0}
              max={1}
              step={0.005}
              value={dissectionProgress}
              onChange={(e) => onManualProgress(parseFloat(e.target.value))}
            />
            <span className="spatial-scrubber-val">
              {Math.round(dissectionProgress * 100)}%
            </span>
          </div>

          <div className="spatial-seg-group">
            <button
              type="button"
              className={`spatial-pill-btn ${dissectionMode === 'peel' ? 'active' : ''}`}
              onClick={() =>
                onChangeDissectionMode(dissectionMode === 'regional' ? 'peel' : 'regional')
              }
              title="Toggle Regional Explosion vs Layer-by-Layer Lateral Peel"
            >
              <Split size={12} />
              <span>{dissectionMode === 'peel' ? 'Peel' : 'Regional'}</span>
            </button>

            <button
              type="button"
              className={`spatial-pill-btn ${imagingMode !== 'realistic' ? 'active' : ''}`}
              onClick={onCycleImagingMode}
              title="Cycle Imaging Mode: PBR / X-Ray / Neuro-Vascular (X)"
            >
              <Scan size={12} />
              <span>{imagingLabel}</span>
            </button>

            <button
              type="button"
              className={`spatial-pill-btn ${allHdLoaded || hdLoadingCount > 0 ? 'active' : ''}`}
              onClick={onPreloadAllHd}
              disabled={allHdLoaded || hdLoadingCount > 0}
              title="Stream all high-poly Draco medical GLBs asynchronously"
              aria-label={`Stream high-poly medical models (${hdLoadedCount} of ${hdTotalCount} loaded)`}
            >
              <Sparkles size={12} />
              <span>
                {allHdLoaded
                  ? 'HD ✓'
                  : hdLoadingCount > 0
                    ? `HD ${hdLoadedCount}/${hdTotalCount}…`
                    : `HD ${hdLoadedCount}/${hdTotalCount}`}
              </span>
            </button>
          </div>
        </div>

        <div className="spatial-dock-row">
          <div className="spatial-seg-group">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`spatial-preset-btn ${cameraPreset === p.id ? 'active' : ''}`}
                onClick={() => onSelectPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="spatial-preset-btn"
              onClick={() => onSelectPreset('default')}
              title="Reset camera angle"
              aria-label="Reset camera angle"
            >
              <RotateCcw size={11} />
            </button>
          </div>

          <div className="spatial-seg-group">
            <button
              type="button"
              className="spatial-preset-btn"
              onClick={() => onZoom(1)}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              className="spatial-preset-btn"
              onClick={() => onZoom(-1)}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut size={12} />
            </button>
            <button
              type="button"
              className={`spatial-preset-btn ${freeOrbit ? 'active' : ''}`}
              onClick={onToggleOrbit}
              title="Toggle Free 360° Orbit (O)"
              aria-label="Toggle Free 360° Orbit"
            >
              <Orbit size={12} />
            </button>
            <button
              type="button"
              className={`spatial-preset-btn ${autoSpin ? 'active' : ''}`}
              onClick={onToggleAutoSpin}
              title="Toggle 360° Auto-Spin"
              aria-label="Toggle 360° Auto-Spin"
            >
              <RotateCw size={12} />
            </button>
            <button
              type="button"
              className={`spatial-preset-btn ${showPins ? 'active' : ''}`}
              onClick={onTogglePins}
              title="Toggle 3D Callout Pins (P)"
              aria-label="Toggle 3D Callout Pins"
            >
              <Tag size={12} />
            </button>
            <button
              type="button"
              className={`spatial-preset-btn ${!isPlaying ? 'warn' : ''}`}
              onClick={onTogglePlay}
              aria-label={
                isPlaying
                  ? 'Pause physiological pulse animations'
                  : 'Play physiological pulse animations'
              }
              title={
                isPlaying
                  ? 'Pause Heartbeat & Respiration'
                  : 'Resume Heartbeat & Respiration'
              }
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
          </div>
        </div>
      </div>

      <div className="spatial-window-bar" aria-hidden="true" />
    </div>
  );
};
