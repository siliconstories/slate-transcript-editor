/**
 * Unified Whisper profile — the SINGLE editing tier (replaces classic + rigid +
 * whisperx). It imports rev.ai OR WhisperX (or a re-importable editing-session file),
 * keeps the source transcript immutable (`model.original`, deep-frozen), records edits
 * as a sparse overlay, and exports faithfully back to the SOURCE schema. The editable
 * surface — overlay, snapshot history, freetext re-alignment, Slate projection,
 * edit-gating, user styling, and UI — is 100% format-agnostic; only `model.original`,
 * the projector branch, and the faithful exporter differ by `model.format`.
 *
 * User styling lives in the overlay under `overlay.styles` (an array of word-anchored
 * mark ranges). It rides the snapshot history (so undo/redo + autosave cover it), is
 * carried forward + anchor-repaired on every word/freetext commit, and is DROPPED by
 * the faithful STT exporters (styling is not part of the ASR schema). To round-trip
 * styling, save the editing-session file (which carries the full overlay).
 */
import buildSentenceModel from '../util/rev-to-sentences';
import { isWhisperxTranscript } from './whisperx-overlay';
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
import { repairStyleRanges } from './repair-style-ranges';
import { SESSION_FORMAT, isSessionFile } from './session-format';

// WhisperX `score` is a forced-ALIGNMENT score, not ASR confidence — it runs far
// lower than rev.ai (corpus median ≈ 0.46), so a 0.85 cutoff flags ~93% of words.
// These format-specific defaults seed the confidence overlay so it highlights ~the
// lowest third instead. rev.ai uses the global defaults (confidenceDefaults absent).
const WHISPERX_CONFIDENCE_DEFAULTS = { cutoff: 0.3, floor: 0.08, cutoffOptions: [0.2, 0.3, 0.45, 0.5, 0.55] };

/**
 * Format-specific confidence defaults for a raw transcript, derivable WITHOUT a
 * profile instance/import — so the public component can seed the preferences store
 * before mount. WhisperX `score` runs far lower than rev.ai confidence, hence the
 * lowered cutoff; rev.ai uses the global defaults (returns undefined).
 */
export const whisperConfidenceDefaults = (parsed) => {
  const data = isSessionFile(parsed) ? parsed.original : parsed;
  return isWhisperxTranscript(data) ? WHISPERX_CONFIDENCE_DEFAULTS : undefined;
};

export const createWhisperProfile = () => {
  let model = null;
  let history = newHistory();

  // Project the immutable model (at the current history cursor) to a Slate value,
  // then stamp the Freestyle anchor span + apply any paragraph-level freetext entries.
  const projectValue = () => applyFreetextOverlay(whisperModelToSlate(model, history), model, currentOverlay(history));

  const sessionExporter = {
    id: 'ste-session',
    label: 'Editing session (.ste.json)',
    ext: 'ste.json',
    run: () => (model ? { format: SESSION_FORMAT, sourceFormat: model.format, original: model.original, overlay: currentOverlay(history) } : null),
  };
  const revExporters = [
    { id: 'json-rev', label: 'rev.ai (faithful)', ext: 'json', run: () => (model ? projectWhisper(model, currentOverlay(history)) : null) },
    {
      // Sentence-level "shadow" of the current word-level state.
      id: 'json-rev-sentences',
      label: 'rev.ai (sentences)',
      ext: 'sentences.json',
      run: () => (model ? buildSentenceModel(projectWhisper(model, currentOverlay(history))) : null),
    },
    sessionExporter,
  ];
  const whisperxExporters = [
    { id: 'json-whisperx', label: 'WhisperX (faithful)', ext: 'json', run: () => (model ? projectWhisper(model, currentOverlay(history)) : null) },
    sessionExporter,
  ];

  // Commit a derived overlay, carrying the previous snapshot's user styles forward and
  // anchor-repairing them against the new word set (repair-then-commit). Returns false
  // on the count-invariant violation (overlay null) or a true no-op.
  const commitDerived = (deriveOverlay) => {
    if (!model) return false;
    const overlay = deriveOverlay();
    if (!overlay) return false;
    const prev = currentOverlay(history);
    const styles = repairStyleRanges(prev.styles || [], model, overlay);
    if (styles.length) overlay.styles = styles;
    if (JSON.stringify(prev) === JSON.stringify(overlay)) return false;
    history = commit(history, overlay);
    return true;
  };

  const profile = {
    id: 'whisper',

    import(parsed) {
      if (isSessionFile(parsed)) {
        model = whisperToModel(parsed.original);
        history = commit(newHistory(), parsed.overlay || {});
      } else {
        model = whisperToModel(parsed);
        history = newHistory();
      }
      // Wire the format-specific surface now that the source format is known.
      profile.format = model.format;
      profile.exporters = model.format === 'revai' ? revExporters : whisperxExporters;
      profile.confidenceDefaults = model.format === 'whisperx' ? WHISPERX_CONFIDENCE_DEFAULTS : undefined;
      profile.editPolicy.supportsAnnotations = model.format === 'whisperx';
      return { value: projectValue(), model };
    },

    // Strict tier: two editing modes selectable in the toolbar. `word` ("Strict") is the
    // per-word seek/mute/rewrite surface (default); `freestyle` ("Loose") is paragraph-level
    // free text with diff-anchored timestamps. `allowsStructuralEdits:false` blocks
    // cross-paragraph edits. `supportsAnnotations` is set per-format on import.
    editPolicy: {
      allowsStructuralEdits: false,
      allowsFreeText: false,
      wordLevelOnly: true,
      modes: ['word', 'freestyle'],
      defaultMode: 'word',
      supportsAnnotations: false,
    },

    exporters: whisperxExporters, // replaced per-format on import
    confidenceDefaults: undefined,
    format: null,

    versioning: {
      snapshot(slateValue) {
        return commitDerived(() => overlayFromSlate(model, slateValue));
      },
      snapshotFreeText(slateValue) {
        return commitDerived(() => freeTextOverlayFromSlate(model, slateValue));
      },
      // Style-only commit: set the user-styling ranges (rides the same history as undo/redo).
      setStyles(nextStyles) {
        if (!model) return false;
        const base = currentOverlay(history);
        const overlay = { ...base };
        const clean = (nextStyles || []).filter(Boolean);
        if (clean.length) overlay.styles = clean;
        else delete overlay.styles;
        if (JSON.stringify(base) === JSON.stringify(overlay)) return false;
        history = commit(history, overlay);
        return true;
      },
      getStyles: () => currentOverlay(history).styles || [],
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

    reproject() {
      return projectValue();
    },

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
