/**
 * Unified Whisper overlay layer — the single dispatch surface over the two
 * accepted source formats (rev.ai and WhisperX). The editor and the unified
 * `whisper` profile speak ONLY this module; the per-format codecs
 * (`rev-overlay.js` / `whisperx-overlay.js`) are internal implementation details.
 *
 * The unified model carries `format: 'revai' | 'whisperx'`. `model.original` stays
 * in its SOURCE schema (deep-frozen, byte-faithful) so faithful export reproduces it
 * losslessly; `model.words` is the normalized editable word list both formats share.
 * Detection is mutually exclusive (rev.ai = `monologues`; WhisperX = `segments` +
 * `word_segments`), so one model is unambiguously one format and the native anchor
 * keys ("monoIdx:elemIdx" vs "segIdx:wordIdx") never collide within a document.
 *
 * The overlay-edit + snapshot-history helpers are format-agnostic and re-exported
 * from `overlay-history.js` so this module is the only import surface the profile needs.
 */
import { isRevTranscript, revToModel, projectRev, overlayFromSlate as revOverlayFromSlate } from './rev-overlay';
import { isWhisperxTranscript, whisperxToModel, projectWhisperx, overlayFromSlate as whisperxOverlayFromSlate } from './whisperx-overlay';
import { isSessionFile } from './session-format';

export {
  newHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  currentOverlay,
  setWordValue,
  setWordMuted,
  revertWord,
  HISTORY_CAP,
} from './overlay-history';

/** Accept rev.ai, WhisperX, or a saved editing-session file. Everything else is rejected. */
export const isWhisperTranscript = (parsed) => isSessionFile(parsed) || isWhisperxTranscript(parsed) || isRevTranscript(parsed);

/**
 * Build the unified immutable model, tagging it with its source `format`. WhisperX
 * is checked first because its predicate (segments + word_segments) is the stricter
 * one; detection is mutually exclusive so the order is not load-bearing.
 */
export const whisperToModel = (parsed) => {
  if (isWhisperxTranscript(parsed)) return { ...whisperxToModel(parsed), format: 'whisperx' };
  if (isRevTranscript(parsed)) return { ...revToModel(parsed), format: 'revai' };
  throw new Error('whisperToModel: unrecognized transcript — expected rev.ai (monologues) or WhisperX (segments + word_segments).');
};

/** Faithful export: rebuild the source schema from the frozen original + overlay. */
export const projectWhisper = (model, overlay) =>
  model.format === 'whisperx' ? projectWhisperx(model.original, overlay) : projectRev(model.original, overlay);

/** Derive a fresh overlay by diffing the Slate value against the model (per-format word-count invariant). */
export const overlayFromSlate = (model, slateValue) =>
  model.format === 'whisperx' ? whisperxOverlayFromSlate(model, slateValue) : revOverlayFromSlate(model, slateValue);

export default { isWhisperTranscript, whisperToModel, projectWhisper, overlayFromSlate };
