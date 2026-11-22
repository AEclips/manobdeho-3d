import React from 'react';
import {
  ArrowDown,
  ArrowRight,
  Focus,
  Minimize2,
  PanelLeftClose,
  Search,
} from 'lucide-react';
import {
  ANATOMY_PARTS,
  CHAPTERS,
  PARTS_BY_ID,
  SYSTEM_MAP,
} from '../data/anatomyDatabase';

interface ChapterSectionsProps {
  selectedPartId: string | null;
  heartRateBpm: number;
  onSelectChapter: (idx: number) => void;
  onSelectPart: (partId: string) => void;
  onIsolatePart: (partId: string) => void;
  onChangeHeartRate: (bpm: number) => void;
  onHideCard: () => void;
  onOpenSearch: () => void;
}

export const ChapterSections: React.FC<ChapterSectionsProps> = ({
  selectedPartId,
  heartRateBpm,
  onSelectChapter,
  onSelectPart,
  onIsolatePart,
  onChangeHeartRate,
  onHideCard,
  onOpenSearch,
}) => {
  return (
    <main className="story-main">
      {CHAPTERS.map((ch) => {
        const isHero = ch.id === 0;
        const isLab = ch.id === 6;
        const chapterParts = ch.highlights
          .map((id) => PARTS_BY_ID[id])
          .filter(Boolean);

        return (
          <section
            key={ch.id}
            id={`chapter-sec-${ch.id}`}
            className="story-section"
          >
            <article className="chapter-card spatial-glass">
              {/* Top Row: Eyebrow + 1-Click Collapse Card Button */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '6px',
                }}
              >
                <div className="chapter-eyebrow">{ch.code}</div>
                <button
                  type="button"
                  className="spatial-mini-btn"
                  onClick={onHideCard}
                  title="Hide story card for unobstructed 3D view (H)"
                  aria-label="Hide story card"
                >
                  <PanelLeftClose size={11} />
                  <span>Hide</span>
                </button>
              </div>

              <h1
                className="chapter-title-en"
                style={isHero ? { fontSize: 'clamp(26px, 2.9vw, 36px)' } : undefined}
              >
                {ch.titleEn}
              </h1>
              <div className="chapter-title-bn">{ch.titleBn}</div>
              <p className="chapter-desc-bn">{ch.descriptionBn}</p>

              {/* Quantitative Spatial Bento Metrics */}
              <div
                className="metrics-grid"
                style={
                  ch.metrics.length === 3
                    ? { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }
                    : undefined
                }
              >
                {ch.metrics.map((m) => (
                  <div key={m.label} className="metric-box">
                    <div className="metric-label">{m.label}</div>
                    <div className="metric-value">{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Hero Actions */}
              {isHero && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'rgba(255,255,255,0.62)',
                    }}
                  >
                    <ArrowDown size={12} color="#7dd3fc" />
                    <span>SCROLL TO DISSECT</span>
                  </div>
                  <button
                    type="button"
                    className="spatial-cta-btn"
                    onClick={() => onSelectChapter(1)}
                  >
                    <span>Start Cranium</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}

              {/* Regional Structure Chips (Chapters 01–05) */}
              {!isHero && !isLab && chapterParts.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9.5px',
                      color: 'rgba(255,255,255,0.58)',
                      marginBottom: '7px',
                    }}
                  >
                    <span>STRUCTURES ({chapterParts.length})</span>
                    <span style={{ color: '#7dd3fc' }}>Tap = Details • 2× = 360°</span>
                  </div>
                  <div className="part-chips-wrap">
                    {chapterParts.map((part) => {
                      const sysColor = SYSTEM_MAP[part.system]?.color ?? '#7dd3fc';
                      return (
                        <button
                          key={part.id}
                          type="button"
                          className={`part-chip ${
                            selectedPartId === part.id ? 'selected' : ''
                          }`}
                          onClick={() => onSelectPart(part.id)}
                          onDoubleClick={() => onIsolatePart(part.id)}
                        >
                          <span
                            style={{
                              width: '6.5px',
                              height: '6.5px',
                              borderRadius: '50%',
                              backgroundColor: sysColor,
                            }}
                          />
                          <span>{part.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chapter 06: Cardiac Rate Simulator & Direct Index */}
              {isLab && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="spatial-bento-card" style={{ padding: '10px 12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10.5px',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={{ color: '#fda4af', fontWeight: 600 }}>
                        CARDIAC SIMULATOR
                      </span>
                      <span style={{ color: '#fb7185', fontWeight: 700 }}>
                        {heartRateBpm} BPM
                      </span>
                    </div>
                    <input
                      type="range"
                      className="spatial-range"
                      aria-label="Heart rate BPM simulation"
                      min={40}
                      max={160}
                      step={2}
                      value={heartRateBpm}
                      onChange={(e) => onChangeHeartRate(parseInt(e.target.value, 10))}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={selectedPartId ?? ''}
                      onChange={(e) => {
                        if (e.target.value) onSelectPart(e.target.value);
                      }}
                      aria-label="Choose anatomical assembly to inspect"
                      className="spatial-select"
                    >
                      <option value="">
                        -- Inspect Structure ({ANATOMY_PARTS.length}) --
                      </option>
                      {ANATOMY_PARTS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.shortLabel} — {p.nameEn}
                        </option>
                      ))}
                    </select>
                    {selectedPartId && (
                      <button
                        type="button"
                        className="spatial-cta-btn"
                        style={{ padding: '8px 11px' }}
                        onClick={() => onIsolatePart(selectedPartId)}
                        title="Isolate selected part in 360°"
                      >
                        <Focus size={14} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      className="spatial-pill-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={() => onSelectChapter(0)}
                    >
                      <Minimize2 size={12} />
                      <span>Assemble Body</span>
                    </button>
                    <button
                      type="button"
                      className="spatial-pill-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={onOpenSearch}
                    >
                      <Search size={12} />
                      <span>Atlas Index</span>
                    </button>
                  </div>
                </div>
              )}
            </article>
          </section>
        );
      })}
    </main>
  );
};
