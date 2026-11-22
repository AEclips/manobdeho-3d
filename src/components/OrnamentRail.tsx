import React from 'react';
import {
  Activity,
  Brain,
  Check,
  Compass,
  Eye,
  Footprints,
  Hand,
  HeartPulse,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { ANATOMICAL_SYSTEMS, CHAPTERS } from '../data/anatomyDatabase';
import { SystemId } from '../types/anatomy';

interface LayerState {
  active: boolean;
  opacity: number;
}

interface OrnamentRailProps {
  activeChapter: number;
  cinemaMode: boolean;
  layersOpen: boolean;
  layerStates: Record<SystemId, LayerState>;
  onSelectChapter: (idx: number) => void;
  onToggleCinema: () => void;
  onToggleLayersOpen: () => void;
  onToggleLayer: (id: SystemId) => void;
  onSoloLayer: (id: SystemId) => void;
  onChangeLayerOpacity: (id: SystemId, opacity: number) => void;
  onResetLayers: () => void;
}

const CHAPTER_ICONS = [
  Sparkles,
  Brain,
  HeartPulse,
  Activity,
  Hand,
  Footprints,
  Sliders,
];

export const OrnamentRail: React.FC<OrnamentRailProps> = ({
  activeChapter,
  cinemaMode,
  layersOpen,
  layerStates,
  onSelectChapter,
  onToggleCinema,
  onToggleLayersOpen,
  onToggleLayer,
  onSoloLayer,
  onChangeLayerOpacity,
  onResetLayers,
}) => {
  const activeLayerCount = Object.values(layerStates).filter((s) => s.active).length;

  return (
    <>
      <nav
        className="ornament-rail spatial-glass"
        aria-label="Spatial Chapter & System Rail"
      >
        {/* Chapters 00–06 */}
        <div className="rail-group">
          {CHAPTERS.map((ch, idx) => {
            const Icon = CHAPTER_ICONS[idx] ?? Compass;
            const isActive = activeChapter === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                className={`rail-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectChapter(ch.id)}
                aria-label={`${ch.navLabel}: ${ch.titleEn}`}
                aria-current={isActive ? 'step' : undefined}
              >
                <Icon size={16} />
                <span className="rail-tooltip spatial-glass">
                  <strong>{ch.navLabel}</strong>
                  <span>{ch.titleBn}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="rail-divider" aria-hidden="true" />

        {/* Layers Popover Trigger & Story Card Hide/Show */}
        <div className="rail-group">
          <button
            type="button"
            className={`rail-btn ${layersOpen ? 'active' : ''}`}
            onClick={onToggleLayersOpen}
            aria-label={`Anatomical Layers (${activeLayerCount} active)`}
          >
            <Layers size={16} />
            <span className="rail-badge">{activeLayerCount}</span>
            <span className="rail-tooltip spatial-glass">
              <strong>Layers ({activeLayerCount}/6)</strong>
              <span>শারীরস্থানিক স্তর ও স্বচ্ছতা</span>
            </span>
          </button>

          <button
            type="button"
            className={`rail-btn ${cinemaMode ? 'active' : ''}`}
            onClick={onToggleCinema}
            aria-label={
              cinemaMode
                ? 'Show Chapter Story Card (H)'
                : 'Hide Story Card for Pure 3D (H)'
            }
          >
            {cinemaMode ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            <span className="rail-tooltip spatial-glass">
              <strong>{cinemaMode ? 'Show Story Card' : 'Pure 3D Focus'}</strong>
              <span>
                {cinemaMode ? 'চ্যাপ্টার কার্ড দেখুন (H)' : 'কার্ড লুকিয়ে ৩ডি দেখুন (H)'}
              </span>
            </span>
          </button>
        </div>
      </nav>

      {/* Floating VisionOS Layers Spatial Popover Window */}
      {layersOpen && (
        <div
          className="spatial-layers-popover spatial-glass"
          role="region"
          aria-label="Anatomical System Layers"
        >
          <div className="spatial-popover-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={15} color="#7dd3fc" />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                Anatomical Layers
              </span>
              <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.58)' }}>
                স্তরসমূহ
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="spatial-mini-btn"
                onClick={onResetLayers}
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
              <button
                type="button"
                className="spatial-icon-circle"
                onClick={onToggleLayersOpen}
                aria-label="Close layers panel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="spatial-layers-list">
            {ANATOMICAL_SYSTEMS.map((sys) => {
              const st = layerStates[sys.id];
              return (
                <div
                  key={sys.id}
                  className={`spatial-layer-row ${st.active ? 'active' : ''}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleLayer(sys.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          backgroundColor: sys.color,
                          boxShadow: st.active ? `0 0 10px ${sys.color}` : 'none',
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#fff' }}>
                          {sys.nameEn}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.58)' }}>
                          {sys.nameBn} • {sys.countLabel}
                        </div>
                      </div>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="spatial-mini-btn"
                        onClick={() => onSoloLayer(sys.id)}
                      >
                        <Eye size={10} />
                        <span>Solo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleLayer(sys.id)}
                        aria-label={`Toggle ${sys.nameEn}`}
                        className={`spatial-check-pill ${st.active ? 'active' : ''}`}
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  </div>

                  {st.active && (
                    <div className="spatial-opacity-bar">
                      <span>OPACITY</span>
                      <input
                        type="range"
                        className="spatial-range"
                        aria-label={`${sys.nameEn} opacity`}
                        min={0.08}
                        max={1}
                        step={0.04}
                        value={st.opacity}
                        onChange={(e) =>
                          onChangeLayerOpacity(sys.id, parseFloat(e.target.value))
                        }
                      />
                      <span>{Math.round(st.opacity * 100)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
