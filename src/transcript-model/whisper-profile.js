/**
 * Unified Whisper profile — the SINGLE editing tier (replaces classic + rigid +
 * whisperx). It imports rev.ai OR WhisperX, keeps the source transcript immutable
 * (`model.original`, deep-frozen), records edits as a sparse overlay, and exports
 * faithfully back to the SOURCE schema. The editable surface — overlay, snapshot
 * history, freetext re-alignment, Slate projection, edit-gating, and UI — is 100%
 * format-agnostic; only `model.original`, the projector branch, and the faithful
 * exporter differ by `model.format`. Versioning state lives in a closure so each
 * editor mount gets its own isolated history.
 */
import buildSentenceModel from '../util/rev-to-sentences';
import {
  isWhisperTranscript,
  whisperToModel,
  projectWhisper,
  overlayFromSlate,
  newHistory,
  commit,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  currentOverlay,
} from './whisper-overlay';
import { whisperModelToSlate } from './whisper-to-slate';
import { freeTextOverlayFromSlate } from './freetext-overlay';
import { applyFreetextOverlay } from './freetext-to-slate';
import { originalWordsBetween } from './freetext-profile-helpers';

// WhisperX `score` is a forced-ALIGNMENT score, not ASR confidence — it runs far
// lower than rev.ai (corpus median ≈ 0.46), so a 0.85 cutoff flags ~93% of words.
// These format-specific defaults seed the confidence overlay so it highlights ~the
// lowest third instead. rev.ai uses the global defaults (confidenceDefaults absent).
const WHISPERX_CONFIDENCE_DEFAULTS = { cutoff: 0.3, floor: 0.08, cutoffOptions: [0.2, 0.3, 0.45, 0.5, 0.55] };

export const createWhisperProfile = () => {
  let model = null;
  let history = newHistory();

  // Project the immutable model (at the current history cursor) to a Slate value,
  // then stamp the Freestyle anchor span + apply any paragraph-level freetext entries.
  const projectValue = () => applyFreetextOverlay(whisperModelToSlate(model, history), model, currentOverlay(history));

  const revExporters = [
    {
      id: 'json-rev',
      label: 'rev.ai (faithful)',
      ext: 'json',
      run: () => (model ? projectWhisper(model, currentOverlay(history)) : null),
    },
    {
      // Sentence-level "shadow" of the current word-level state — the same adapter
      // backs the export menu and the live onSentenceModel emit.
      id: 'json-rev-sentences',
      label: 'rev.ai (sentences)',
      ext: 'sentences.json',
      run: () => (model ? buildSentenceModel(projectWhisper(model, currentOverlay(history))) : null),
    },
  ];
  const whisperxExporters = [
    {
      id: 'json-whisperx',
      label: 'WhisperX (faithful)',
      ext: 'json',
      run: () => (model ? projectWhisper(model, currentOverlay(history)) : null),
    },
  ];

  const profile = {
    id: 'whisper',

    import(parsed) {
      model = whisperToModel(parsed);
      history = newHistory();
      // Wire the format-specific surface now that the source format is known.
      profile.format = model.format;
      profile.exporters = model.format === 'revai' ? revExporters : whisperxExporters;
      profile.confidenceDefaults = model.format === 'whisperx' ? WHISPERX_CONFIDENCE_DEFAULTS : undefined;
      profile.editPolicy.supportsAnnotations = model.format === 'whisperx';
      return { value: projectValue(), model };
    },

    // Strict tier: two editing modes selectable in the toolbar. `word` is the per-word
    // seek/mute/rewrite grid (default); `freestyle` is paragraph-level free text with
    // diff-anchored timestamps. `allowsStructuralEdits:false` blocks cross-paragraph edits.
    // `supportsAnnotations` is set per-format on import (rich segment chips exist only on WhisperX).
    editPolicy: {
      allowsStructuralEdits: false,
      allowsFreeText: false,
      wordLevelOnly: true,
      modes: ['word', 'freestyle'],
      defaultMode: 'word',
      supportsAnnotations: false,
    },

    // Replaced per-format on import; a sensible default keeps the contract satisfiable pre-import.
    exporters: whisperxExporters,
    confidenceDefaults: undefined,
    format: null,

    versioning: {
      // Diff the editor's current Slate value into a fresh overlay and commit it.
      // Returns false on the count-invariant violation (overlayFromSlate -> null) or a no-op.
      snapshot(slateValue) {
        if (!model) return false;
        const overlay = overlayFromSlate(model, slateValue);
        if (!overlay) return false;
        if (JSON.stringify(currentOverlay(history)) === JSON.stringify(overlay)) return false;
        history = commit(history, overlay);
        return true;
      },
      // Freestyle snapshot: tolerates word-count changes by reading the aligned paragraph
      // tokens off the value. Returns false on a structural anomaly (overlay null) or a no-op.
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

    // Re-derive the Slate value from the immutable model at the current history cursor
    // (used by the editor after undo/redo/revert to re-render).
    reproject() {
      return projectValue();
    },

    // The original model words a freestyle paragraph owns (for re-alignment + per-sentence
    // revert). Normalised for align-paragraph.js. Format-agnostic via the model word fields.
    originalWordsBetween(firstKey, lastKey) {
      return originalWordsBetween(model, firstKey, lastKey);
    },
  };

  return profile;
};

export const whisperDescriptor = {
  id: 'whisper',
  detect: (parsed) => isWhisperTranscript(parsed),
  create: createWhisperProfile,
};

export default whisperDescriptor;
