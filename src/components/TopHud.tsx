import React from 'react';
import { Maximize, Minimize, Search } from 'lucide-react';
import { CHAPTERS } from '../data/anatomyDatabase';

interface TopHudProps {
  scrollProgress: number;
  activeChapter: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  heartRateBpm: number;
  onToggleFullscreen: () => void;
  onOpenSearch: () => void;
}

export const TopHud: React.FC<TopHudProps> = ({
  scrollProgress,
  activeChapter,
  isPlaying,
  isFullscreen,
  heartRateBpm,
  onToggleFullscreen,
  onOpenSearch,
}) => {
  const ch = CHAPTERS[activeChapter] ?? CHAPTERS[0];

  return (
    <header className="spatial-top-header">
      <div className="spatial-status-pill spatial-glass">
        <div className="status-brand">
          <span className="status-orb" aria-hidden="true" />
          <span className="status-brand-text">মানবদেহ ৩ডি</span>
        </div>

        <span className="status-sep" aria-hidden="true" />

        <div className="status-chapter-readout">
          <span className="status-chapter-name">{ch.navLabel}</span>
          <span className="status-pct">{Math.round(scrollProgress * 100)}%</span>
        </div>

        <span className="status-sep hide-mobile" aria-hidden="true" />

        <div className="status-ecg hide-mobile">
          <svg
            width="44"
            height="16"
            viewBox="0 0 48 18"
            aria-hidden="true"
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <g
              className={isPlaying ? 'ecg-wave-track' : ''}
              style={{
                animationDuration: `${(60 / heartRateBpm).toFixed(2)}s`,
              }}
            >
              <polyline
                fill="none"
                stroke="#fb7185"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,10 8,10 11,8 14,10 17,10 19,13 22,2 25,16 28,10 33,10 36,7 40,10 48,10 56,10 59,8 62,10 65,10 67,13 70,2 73,16 76,10 81,10 84,7 88,10 96,10"
              />
            </g>
          </svg>
          <span>{heartRateBpm} BPM</span>
        </div>

        <span className="status-sep" aria-hidden="true" />

        <div className="status-actions">
          <button
            type="button"
            className="spatial-pill-btn"
            style={{ padding: '5px 10px', fontSize: '11px' }}
            onClick={onOpenSearch}
            title="Search Anatomical Atlas (Ctrl+K)"
            aria-label="Search Anatomical Atlas"
          >
            <Search size={13} />
            <span className="hide-mobile">Search</span>
            <kbd className="status-kbd hide-mobile">⌘K</kbd>
          </button>

          <button
            type="button"
            className={`spatial-icon-circle ${isFullscreen ? 'active' : ''}`}
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
      </div>
    </header>
  );
};
