/**
 * Rigid ("scientific" / rev.ai) profile — the originally-imported transcript is
 * kept immutable; words may only be muted or rewritten (never added, deleted, or
 * reordered); export reconstructs the rev.ai schema byte-faithfully. Versioning
 * snapshots the sparse overlay (not the whole value) and is owned here, in a
 * closure, so each editor mount gets its own isolated history. The editor drives
 * import / edit-capture / versioning / faithful export through this object.
 */
import convertDpeToSlate from '../util/dpe-to-slate';
import buildSentenceModel from '../util/rev-to-sentences';
import {
  isRevTranscript,
  revToModel,
  projectRev,
  newHistory,
  commit,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  currentOverlay,
  overlayFromSlate,
} from './rev-overlay';
import { revModelToDpe } from './rev-to-slate';

export const createRigidProfile = () => {
  let model = null;
  let history = newHistory();

  // The editor speaks Slate; rigid stores rev.ai. We project the immutable model
  // (at the current history cursor) to a DPE object and reuse the classic
  // convertDpeToSlate so `_key` / `confidence` / `muted` / `punctAfter` survive
  // by-reference onto the Slate leaves (see getWordsForParagraph).
  const projectValue = () => convertDpeToSlate(revModelToDpe(model, history));

  return {
    id: 'rigid',

    import(parsed) {
      model = revToModel(parsed);
      history = newHistory();
      return { value: projectValue(), model };
    },

    editPolicy: { allowsStructuralEdits: false, allowsFreeText: false, wordLevelOnly: true },

    exporters: [
      {
        id: 'json-rev',
        label: 'rev.ai (faithful)',
        ext: 'json',
        run: () => (model ? projectRev(model.original, currentOverlay(history)) : null),
      },
      {
        // Sentence-level "shadow" of the current word-level state — the same
        // adapter backs the export menu and the live onSentenceModel emit.
        id: 'json-rev-sentences',
        label: 'rev.ai (sentences)',
        ext: 'sentences.json',
        run: () => (model ? buildSentenceModel(projectRev(model.original, currentOverlay(history))) : null),
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
  };
};

export const rigidDescriptor = {
  id: 'rigid',
  detect: (parsed) => isRevTranscript(parsed),
  create: createRigidProfile,
};

export default rigidDescriptor;
