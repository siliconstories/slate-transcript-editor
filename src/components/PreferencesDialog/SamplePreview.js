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

  const colors = PREVIEW_WORDS.map((w, i) =>
    !c.overlay ? null : c.level === 'sentence' ? (sentenceColors ? sentenceColors[i] : null) : confidenceToStyle(w.confidence, opts)
  );

  return (
    <div style={{ padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: 6, background: '#fff', lineHeight: 2, fontSize: 16 }}>
      {PREVIEW_WORDS.map((w, i) => {
        const myColor = colors[i];
        const nextColor = colors[i + 1];
        // fill the inter-word space with a gradient so a run reads as one stroke
        const spaceBg = myColor && nextColor ? `linear-gradient(to right, ${myColor}, ${nextColor})` : null;
        return (
          <React.Fragment key={i}>
            <span title={`confidence ${w.confidence}`} style={myColor ? { backgroundColor: myColor } : undefined}>
              {w.text}
            </span>
            {w.punctAfter ? <span style={myColor ? { backgroundColor: myColor } : undefined}>{w.punctAfter}</span> : null}
            <span style={spaceBg ? { background: spaceBg } : undefined}> </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SamplePreview;
