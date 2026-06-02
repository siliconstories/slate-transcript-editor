/**
 * WhisperX ("expert") profile — the same overlay-on-immutable-original tier as
 * rev.ai/rigid, applied to the richer WhisperX schema. The imported transcript is
 * kept immutable; words may only be muted or rewritten (never added, deleted, or
 * reordered); export reconstructs the full WhisperX file faithfully, preserving the
 * per-segment annotations (topics, moods, sentiment, concept tags, pre-made
 * sentences), chunk groupings, per-word diarization, and `annotation_metadata`.
 * Versioning snapshots the sparse overlay and is owned here in a closure, so each
 * editor mount gets its own isolated history.
 */
import {
  isWhisperxTranscript,
  whisperxToModel,
  projectWhisperx,
  newHistory,
  commit,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  currentOverlay,
  overlayFromSlate,
} from './whisperx-overlay';
import { whisperxModelToSlate } from './whisperx-to-slate';
import { freeTextOverlayFromSlate } from './freetext-overlay';
import { applyFreetextOverlay } from './freetext-to-slate';
import { originalWordsBetween } from './freetext-profile-helpers';

export const createWhisperxProfile = () => {
  let model = null;
  let history = newHistory();

  // The editor speaks Slate; whisperx stores its native JSON. We project the
  // immutable model (at the current history cursor) DIRECTLY to a Slate value
  // (one paragraph per segment) — not via DPE — so wordless segments survive, then
  // stamp the Freestyle anchor span + apply any paragraph-level freetext entries.
  const projectValue = () => applyFreetextOverlay(whisperxModelToSlate(model, history), model, currentOverlay(history));

  return {
    id: 'whisperx',

    import(parsed) {
      model = whisperxToModel(parsed);
      history = newHistory();
      return { value: projectValue(), model };
    },

    // Strict tier: two editing modes selectable in the toolbar. `word` is the
    // per-word seek/mute/rewrite grid (default); `freestyle` is paragraph-level
    // free text with diff-anchored timestamps. `allowsStructuralEdits:false` still
    // blocks cross-paragraph (Enter/merge) edits in freestyle.
    editPolicy: { allowsStructuralEdits: false, allowsFreeText: false, wordLevelOnly: true, modes: ['word', 'freestyle'], defaultMode: 'word' },

    // WhisperX `score` is a forced-ALIGNMENT score, not ASR confidence — it runs far
    // lower than rev.ai (corpus median ≈ 0.46), so the global 0.85 cutoff flags ~93%
    // of words. These format-specific defaults seed the confidence overlay (and the
    // toolbar threshold dropdown) so it highlights ~the lowest third instead.
    confidenceDefaults: { cutoff: 0.3, floor: 0.08, cutoffOptions: [0.2, 0.3, 0.45, 0.5, 0.55] },

    exporters: [
      {
        id: 'json-whisperx',
        label: 'WhisperX (faithful)',
        ext: 'json',
        run: () => (model ? projectWhisperx(model.original, currentOverlay(history)) : null),
      },
    ],

    versioning: {
      // Diff the editor's current Slate value into a fresh overlay and commit it.
      // Returns false (no commit) when the rigid count invariant is violated
      // (overlayFromSlate -> null) or the overlay is unchanged.
      snapshot(slateValue) {
        if (!model) return false;
        const overlay = overlayFromSlate(model, slateValue);
        if (!overlay) return false;
        if (JSON.stringify(currentOverlay(history)) === JSON.stringify(overlay)) return false;
        history = commit(history, overlay);
        return true;
      },
      // Freestyle snapshot: tolerates word-count changes by reading the aligned
      // paragraph tokens off the value (see freeTextOverlayFromSlate). Returns false
      // on a structural anomaly (overlay null) or a no-op.
      snapshotFreeText(slateValue) {
        if (!model) return false;
        const overlay = freeTextOverlayFromSlate(model, slateValue);
        if (!overlay) return false;
        if (JSON.stringify(currentOverlay(history)) === JSON.stringify(overlay)) return false;
        history = commit(history, overlay);
        return true;
      },
      undo() {
        history = historyUndo(history);
      },
      redo() {
        history = historyRedo(history);
      },
      revertAll() {
        history = newHistory();
      },
      canUndo: () => historyCanUndo(history),
      canRedo: () => historyCanRedo(history),
      currentOverlay: () => currentOverlay(history),
    },

    // Re-derive the Slate value from the immutable model at the current history
    // cursor (used by the editor after undo/redo/revert to re-render).
    reproject() {
      return projectValue();
    },

    // The original model words a freestyle paragraph owns (for re-alignment +
    // per-sentence revert). Normalised for align-paragraph.js.
    originalWordsBetween(firstKey, lastKey) {
      return originalWordsBetween(model, firstKey, lastKey);
    },
  };
};

export const whisperxDescriptor = {
  id: 'whisperx',
  detect: (parsed) => isWhisperxTranscript(parsed),
  create: createWhisperxProfile,
};

export default whisperxDescriptor;
