import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Eye,
  EyeOff,
  Focus,
  Gauge,
  Loader2,
  Sparkles,
  Stethoscope,
  X,
  Zap,
} from 'lucide-react';
import { ANATOMY_PARTS, PARTS_BY_ID, SYSTEM_MAP } from '../data/anatomyDatabase';
import { HdManifestEntry, HdPartStatus } from '../three/HighPolyAssetManager';

type InspectorTabId = 'overview' | 'neurovascular' | 'clinical';
type LangMode = 'both' | 'bn' | 'en';

interface ClinicalInspectorProps {
  partId: string | null;
  isolatedPartId: string | null;
  isolationGhostContext: boolean;
  hdStatus?: HdPartStatus;
  hdInfo?: HdManifestEntry | null;
  ktx2Ready?: boolean;
  onClose: () => void;
  onSelectPart: (partId: string) => void;
  onToggleIsolate: (partId: string) => void;
  onToggleGhostContext: () => void;
}

const TAB_DEFS: Array<{ id: InspectorTabId; label: string }> = [
  { id: 'overview', label: 'পরিচিতি ও কাজ' },
  { id: 'neurovascular', label: 'রক্ত ও স্নায়ু' },
  { id: 'clinical', label: 'স্পেকস ও রোগতত্ত্ব' },
];

export const ClinicalInspector: React.FC<ClinicalInspectorProps> = ({
  partId,
  isolatedPartId,
  isolationGhostContext,
  hdStatus,
  hdInfo,
  ktx2Ready,
  onClose,
  onSelectPart,
  onToggleIsolate,
  onToggleGhostContext,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTabId>('overview');
  const [langMode, setLangMode] = useState<LangMode>('both');

  const tabRefs = useRef<Record<InspectorTabId, HTMLButtonElement | null>>({
    overview: null,
    neurovascular: null,
    clinical: null,
  });
  const panelRefs = useRef<Record<InspectorTabId, HTMLDivElement | null>>({
    overview: null,
    neurovascular: null,
    clinical: null,
  });

  // Sync active tab when browser Find-in-Page matches inside a hidden="until-found" panel
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    (Object.keys(panelRefs.current) as InspectorTabId[]).forEach((tid) => {
      const el = panelRefs.current[tid];
      if (!el) return;
      const onMatch = () => setActiveTab(tid);
      el.addEventListener('beforematch', onMatch);
      cleanups.push(() => el.removeEventListener('beforematch', onMatch));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [partId]);

  if (!partId) return null;
  const part = PARTS_BY_ID[partId];
  if (!part) return null;

  const sys = SYSTEM_MAP[part.system];
  const isIsolated = isolatedPartId === part.id;

  const curIdx = ANATOMY_PARTS.findIndex((p) => p.id === part.id);
  const prevPart =
    ANATOMY_PARTS[(curIdx - 1 + ANATOMY_PARTS.length) % ANATOMY_PARTS.length];
  const nextPart = ANATOMY_PARTS[(curIdx + 1) % ANATOMY_PARTS.length];

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TAB_DEFS.length;
    else if (e.key === 'ArrowLeft')
      nextIdx = (idx - 1 + TAB_DEFS.length) % TAB_DEFS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = TAB_DEFS.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      const target = TAB_DEFS[nextIdx];
      setActiveTab(target.id);
      tabRefs.current[target.id]?.focus();
    }
  };

  return (
    <aside
      className="inspector-drawer spatial-glass"
      aria-label={`Clinical profile for ${part.nameEn}`}
    >
      {/* Spatial Inspector Header */}
      <div className="inspector-header">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 9px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${sys?.color ?? '#7dd3fc'}55`,
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 600,
                color: sys?.color ?? '#7dd3fc',
                marginBottom: '6px',
              }}
            >
              <span>{sys?.nameEn}</span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>{part.systemSublabel}</span>
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '19px',
                fontWeight: 700,
                lineHeight: 1.18,
                color: '#fff',
              }}
            >
              {langMode === 'bn' ? part.nameBn : part.nameEn}
            </h2>
            {langMode !== 'en' && langMode !== 'bn' && (
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#5eead4',
                  marginTop: '2px',
                }}
              >
                {part.nameBn}
              </div>
            )}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                fontStyle: 'italic',
                color: 'rgba(255,255,255,0.58)',
                marginTop: '3px',
              }}
            >
              {part.latinName}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close clinical inspector"
            className="spatial-icon-circle"
            style={{ width: '32px', height: '32px', flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* 360° Isolation Action Row + Language Switcher */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            marginTop: '11px',
          }}
        >
          <button
            type="button"
            className={`spatial-cta-btn ${isIsolated ? 'active' : ''}`}
            style={{
              flex: 1,
              padding: '7px 11px',
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
            onClick={() => onToggleIsolate(part.id)}
          >
            <Focus size={13} />
            <span>{isIsolated ? 'Exit 360°' : '360° Isolate'}</span>
          </button>

          {isIsolated && (
            <button
              type="button"
              className={`spatial-pill-btn ${isolationGhostContext ? 'active' : ''}`}
              onClick={onToggleGhostContext}
              title="Toggle ghosted surrounding anatomy"
            >
              {isolationGhostContext ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{isolationGhostContext ? 'Ghost' : 'Solo'}</span>
            </button>
          )}

          {/* Language Switcher Pill */}
          <div className="spatial-lang-switch" role="group" aria-label="Language filter">
            {(
              [
                { id: 'both', label: 'উভয়' },
                { id: 'bn', label: 'বাংলা' },
                { id: 'en', label: 'EN' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={langMode === opt.id ? 'active' : ''}
                onClick={() => setLangMode(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className="spatial-icon-circle"
              onClick={() => onSelectPart(prevPart.id)}
              title={`Previous: ${prevPart.shortLabel}`}
              aria-label={`Previous part: ${prevPart.nameEn}`}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="spatial-icon-circle"
              onClick={() => onSelectPart(nextPart.id)}
              title={`Next: ${nextPart.shortLabel}`}
              aria-label={`Next part: ${nextPart.nameEn}`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* High-Poly On-Demand Medical Mesh Streaming Status */}
        {(hdInfo || (hdStatus && hdStatus !== 'idle')) && (
          <div
            className={`spatial-hd-badge ${hdStatus === 'loaded' ? 'loaded' : ''} ${
              hdStatus === 'loading' ? 'loading' : ''
            }`}
          >
            {hdStatus === 'loading' ? (
              <>
                <Loader2
                  size={11}
                  style={{ animation: 'spin 0.9s linear infinite', color: '#7dd3fc' }}
                />
                <span>Streaming HD Medical Mesh (Draco)...</span>
              </>
            ) : hdStatus === 'error' ? (
              <span>Proxy Mesh Active (HD offline)</span>
            ) : hdInfo ? (
              <>
                <Sparkles size={11} color="#5eead4" />
                <span>
                  HD Medical Mesh • {hdInfo.triangles.toLocaleString()} tris •{' '}
                  {Math.round(hdInfo.compressedBytes / 1024)} KB • Draco
                  {ktx2Ready ? ' + KTX2 PBR' : ''}
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* VisionOS Segmented Tabs (WAI-ARIA compliant with aria-selected + non-color underline) */}
        <div
          role="tablist"
          aria-label="Clinical profile sections"
          className="spatial-tabs"
        >
          {TAB_DEFS.map((t, idx) => {
            const selected = activeTab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`inspector-tab-${t.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className="spatial-tab"
                onClick={() => setActiveTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Tab Panels Area */}
      <div className="inspector-scroll">
        {/* TAB 1: Overview & Functions */}
        <div
          ref={(el) => {
            panelRefs.current.overview = el;
          }}
          role="tabpanel"
          aria-labelledby="inspector-tab-overview"
          tabIndex={activeTab === 'overview' ? 0 : undefined}
          hidden={
            activeTab === 'overview'
              ? undefined
              : ('until-found' as unknown as boolean)
          }
        >
          <div className="spatial-panel-stack">
            <div className="spatial-bento-card">
              <div className="spatial-card-kicker" style={{ color: '#7dd3fc' }}>
                <Stethoscope size={13} />
                <span>MORPHOLOGY & OVERVIEW (গঠন ও পরিচিতি)</span>
              </div>
              {langMode !== 'en' && (
                <p className="spatial-card-copy-bn">{part.summaryBn}</p>
              )}
              {langMode !== 'bn' && (
                <p className="spatial-card-copy-en">{part.summaryEn}</p>
              )}
            </div>

            <div className="spatial-bento-card">
              <div className="spatial-card-kicker" style={{ color: '#5eead4' }}>
                <Activity size={13} />
                <span>PHYSIOLOGICAL FUNCTIONS (শারীরবৃত্তীয় কাজ)</span>
              </div>
              <ul className="spatial-bullet-list">
                {part.functions.map((fn, idx) => (
                  <li key={idx}>
                    <span className="bullet-dot" style={{ color: '#5eead4' }}>
                      ▸
                    </span>
                    <span>{fn}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* TAB 2: Neurovascular Supply */}
        <div
          ref={(el) => {
            panelRefs.current.neurovascular = el;
          }}
          role="tabpanel"
          aria-labelledby="inspector-tab-neurovascular"
          tabIndex={activeTab === 'neurovascular' ? 0 : undefined}
          hidden={
            activeTab === 'neurovascular'
              ? undefined
              : ('until-found' as unknown as boolean)
          }
        >
          <div className="spatial-panel-stack">
            <div className="spatial-bento-card">
              <div className="spatial-card-kicker" style={{ color: '#fda4af' }}>
                <Droplets size={13} />
                <span>ARTERIAL & VENOUS CIRCULATION</span>
              </div>
              <div className="spatial-nv-block">
                <div className="spatial-nv-label" style={{ color: '#fb7185' }}>
                  ARTERIAL SUPPLY (অক্সিজেনযুক্ত ধমনী)
                </div>
                <div className="spatial-nv-val">{part.bloodSupply.arterial}</div>
              </div>
              <div className="spatial-nv-block">
                <div className="spatial-nv-label" style={{ color: '#7dd3fc' }}>
                  VENOUS DRAINAGE (শিরা নিষ্কাশন)
                </div>
                <div className="spatial-nv-val">{part.bloodSupply.venous}</div>
              </div>
            </div>

            <div className="spatial-bento-card">
              <div className="spatial-card-kicker" style={{ color: '#fde047' }}>
                <Zap size={13} />
                <span>INNERVATION (স্নায়ু সংযোগ)</span>
              </div>
              <div className="spatial-nv-val">{part.innervation}</div>
            </div>
          </div>
        </div>

        {/* TAB 3: Quantitative Specs & Clinical Pathology */}
        <div
          ref={(el) => {
            panelRefs.current.clinical = el;
          }}
          role="tabpanel"
          aria-labelledby="inspector-tab-clinical"
          tabIndex={activeTab === 'clinical' ? 0 : undefined}
          hidden={
            activeTab === 'clinical'
              ? undefined
              : ('until-found' as unknown as boolean)
          }
        >
          <div className="spatial-panel-stack">
            <div className="spatial-bento-card">
              <div className="spatial-card-kicker" style={{ color: '#7dd3fc' }}>
                <Gauge size={13} />
                <span>QUANTITATIVE CLINICAL SPECS (বাস্তব পরিমাপ)</span>
              </div>
              <div className="spatial-spec-list">
                {Object.entries(part.specs).map(([k, v]) => (
                  <div key={k} className="spatial-spec-row">
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="spatial-bento-card danger-tint">
              <div className="spatial-card-kicker" style={{ color: '#fda4af' }}>
                <AlertTriangle size={13} />
                <span>CLINICAL PATHOLOGY & LANDMARKS (রোগ ও ইনজুরি)</span>
              </div>
              <ul className="spatial-bullet-list">
                {part.clinicalPathology.map((path, idx) => (
                  <li key={idx} style={{ color: '#ffe4e6' }}>
                    <span className="bullet-dot" style={{ color: '#fb7185' }}>
                      •
                    </span>
                    <span>{path}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
