import React, { useMemo } from 'react';
import { confidenceToStyle } from '../../util/confidence-scale';
import { confidenceOf, groupSlateWordsIntoSentences } from '../../util/rev-to-sentences';
import { usePreferences } from '../../preferences/PreferencesContext';
import PREVIEW_WORDS from './sample-confidence';

/**
 * Live confidence preview — re-renders as the cutoff / level / opacity change, so
 * the user sees exactly what the overlay will do. Reuses the same pure
 * confidenceToStyle the editor overlay uses (single source of truth).
 */
const SamplePreview = () => {
  const { settings } = usePreferences();
  const c = settings.confidence;
  const opts = { cutoff: c.cutoff, floor: c.floor, highlightOpacity: settings.appearance.highlightOpacity };
  const metricIdx = c.sentenceMetric === 'duration_weighted' ? 1 : 0;

  const sentenceColors = useMemo(() => {
    if (c.level !== 'sentence') return null;
    const colors = new Array(PREVIEW_WORDS.length).fill(null);
    groupSlateWordsIntoSentences(PREVIEW_WORDS).forEach(({ wIdxStart, wIdxEnd, words }) => {
      const color = confidenceToStyle(confidenceOf(words)[metricIdx], opts);
      for (let i = wIdxStart; i <= wIdxEnd; i += 1) colors[i] = color;
    });
    return colors;
    // eslint-disable-next-line
  }, [c.level, c.cutoff, c.floor, settings.appearance.highlightOpacity, metricIdx]);

  return (
    <div style={{ padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: 6, background: '#fff', lineHeight: 2, fontSize: 16 }}>
      {PREVIEW_WORDS.map((w, i) => {
        const bg = c.overlay ? (c.level === 'sentence' ? sentenceColors[i] : confidenceToStyle(w.confidence, opts)) : null;
        return (
          <React.Fragment key={i}>
            <span title={`confidence ${w.confidence}`} style={bg ? { backgroundColor: bg, borderRadius: 2, padding: '1px 1px' } : undefined}>
              {w.text}
            </span>
            {w.punctAfter || ''}{' '}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SamplePreview;
