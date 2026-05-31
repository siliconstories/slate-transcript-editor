/**
 * Map an ASR word/sentence confidence (0..1) to a warm "heat" background that
 * surfaces only the low-confidence tail.
 *
 *   confidence >= cutoff           -> null (no highlight)
 *   confidence in [floor, cutoff)  -> warm hsla(), ramping amber -> red as
 *                                     confidence falls toward floor
 *   confidence <  floor            -> clamped to floor (max severity)
 *
 * Severity is encoded REDUNDANTLY in alpha + lightness + hue, so it stays
 * readable under red/green color-vision deficiency (you still see "darker +
 * heavier = worse" even if the hue axis collapses).
 *
 * Dependency-free on purpose: reused by the editor overlay (Slate decorations)
 * and the preferences dialog's live sample preview alike.
 */

export const DEFAULT_CONFIDENCE_OPTS = { cutoff: 0.85, floor: 0.55, highlightOpacity: 0.5 };

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Normalized severity in [0,1]: 0 at/above cutoff (no heat), 1 at/below floor.
 * Returns null when confidence is absent/non-numeric (graceful no-op).
 */
export const confidenceSeverity = (confidence, cutoff = 0.85, floor = 0.55) => {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null;
  if (confidence >= cutoff) return 0;
  const span = cutoff - floor;
  if (span <= 0) return 1;
  return clamp01((cutoff - confidence) / span);
};

/**
 * @param {number} confidence  0..1, or non-number (=> null, graceful no-op)
 * @param {object} [opts] { cutoff=0.85, floor=0.55, highlightOpacity=0.5 }
 * @returns {string|null} a CSS color usable as `background-color`, or null when
 *                        at/above cutoff or confidence is absent.
 */
export const confidenceToStyle = (confidence, opts = {}) => {
  const { cutoff = 0.85, floor = 0.55, highlightOpacity = 0.5 } = opts;
  const t = confidenceSeverity(confidence, cutoff, floor);
  if (t === null || t === 0) return null;
  const hue = 45 - 37 * t; // amber 45deg -> red 8deg
  const lightness = 85 - 30 * t; // pale 85% -> saturated 55%
  const minAlpha = 0.06;
  const alpha = minAlpha + (highlightOpacity - minAlpha) * t;
  return `hsla(${hue.toFixed(1)}, 95%, ${lightness.toFixed(1)}%, ${alpha.toFixed(3)})`;
};

export const CONFIDENCE_BANDS = 5;

/**
 * Coarse severity bucket (0..CONFIDENCE_BANDS). Band 0 == no highlight. Used to
 * coalesce adjacent equal-severity words into fewer Slate decorations and to
 * memoize on the band rather than on raw float jitter.
 */
export const confidenceBand = (confidence, opts = {}) => {
  const { cutoff = 0.85, floor = 0.55 } = opts;
  const t = confidenceSeverity(confidence, cutoff, floor);
  if (t === null || t === 0) return 0;
  return Math.min(CONFIDENCE_BANDS, Math.max(1, Math.ceil(t * CONFIDENCE_BANDS)));
};
