import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, Search, X } from 'lucide-react';
import {
  ANATOMICAL_SYSTEMS,
  ANATOMY_PARTS,
  SYSTEM_MAP,
} from '../data/anatomyDatabase';
import { SystemId } from '../types/anatomy';

interface AtlasSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectPart: (partId: string) => void;
  onIsolatePart: (partId: string) => void;
}

export const AtlasSearchDialog: React.FC<AtlasSearchDialogProps> = ({
  open,
  onClose,
  onSelectPart,
  onIsolatePart,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [query, setQuery] = useState('');
  const [filterSys, setFilterSys] = useState<SystemId | 'all'>('all');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Sync native Esc/backdrop dismissal + closedby fallback for browsers lacking closedBy
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialog.close();
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  const filteredParts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANATOMY_PARTS.filter((part) => {
      if (filterSys !== 'all' && part.system !== filterSys) return false;
      if (!q) return true;
      return (
        part.nameEn.toLowerCase().includes(q) ||
        part.nameBn.toLowerCase().includes(q) ||
        part.latinName.toLowerCase().includes(q) ||
        part.shortLabel.toLowerCase().includes(q) ||
        part.summaryBn.toLowerCase().includes(q) ||
        part.clinicalPathology.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [query, filterSys]);

  const handlePick = (partId: string, isolate = false) => {
    dialogRef.current?.close();
    if (isolate) {
      onIsolatePart(partId);
    } else {
      onSelectPart(partId);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="atlas-dialog"
      aria-labelledby="atlas-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {/* Dialog Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(148,163,184,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <h2
            id="atlas-dialog-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            Anatomical Atlas Index (সকল অঙ্গ ও হাড় অনুসন্ধান)
          </h2>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#94a3b8',
              marginTop: '2px',
            }}
          >
            Search by English, বাংলা, Terminologia Anatomica Latin, or Pathology
          </div>
        </div>
        <form method="dialog">
          <button
            type="submit"
            aria-label="Close Atlas Search"
            style={{
              background: 'rgba(30,41,59,0.8)',
              border: '1px solid rgba(148,163,184,0.22)',
              color: '#e2e8f0',
              borderRadius: '10px',
              width: '32px',
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </form>
      </div>

      {/* Search Input & System Filter Pills */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(148,163,184,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(56,189,248,0.38)',
          }}
        >
          <Search size={16} color="#38bdf8" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="যেমন: Heart, মস্তিষ্ক, Femur, Sciatic, যকৃৎ, Stroke..."
            aria-label="Search anatomical structures"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            className={`spatial-pill-btn ${filterSys === 'all' ? 'active' : ''}`}
            onClick={() => setFilterSys('all')}
          >
            All ({ANATOMY_PARTS.length})
          </button>
          {ANATOMICAL_SYSTEMS.map((sys) => (
            <button
              key={sys.id}
              type="button"
              className={`spatial-pill-btn ${filterSys === sys.id ? 'active' : ''}`}
              onClick={() => setFilterSys(sys.id)}
            >
              {sys.nameEn.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {filteredParts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#94a3b8',
              fontSize: '13.5px',
            }}
          >
            No matching anatomical structures found. Try searching in English, Bengali, or Latin.
          </div>
        ) : (
          filteredParts.map((part) => {
            const sysColor = SYSTEM_MAP[part.system]?.color ?? '#38bdf8';
            return (
              <div
                key={part.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  background: 'rgba(15,23,42,0.72)',
                  border: '1px solid rgba(148,163,184,0.14)',
                }}
              >
                <button
                  type="button"
                  onClick={() => handlePick(part.id, false)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: sysColor,
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>
                      {part.nameEn}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: '#64748b',
                      }}
                    >
                      Ch.{part.chapter}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#2dd4bf' }}>
                    {part.nameBn}{' '}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10.5px',
                        color: '#94a3b8',
                        fontStyle: 'italic',
                      }}
                    >
                      — {part.latinName}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="spatial-cta-btn"
                  style={{ padding: '7px 12px', fontSize: '11px' }}
                  onClick={() => handlePick(part.id, true)}
                  title="Zoom and isolate in 360°"
                >
                  <Focus size={13} />
                  <span>360°</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </dialog>
  );
};
