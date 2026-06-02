/**
 * TranscriptProfile registry. A profile decides how an imported transcript is
 * detected, converted to a Slate value, what edits are allowed, how it is
 * exported, and how versioning/undo works. The editor stays format-agnostic: it
 * routes import / edit-gate / export / versioning through the resolved profile.
 *
 * There is now exactly ONE tier — the unified `whisper` profile — which imports
 * rev.ai OR WhisperX and keeps the source transcript immutable. There is no
 * free-text/DPE fallback: an unrecognized transcript is a hard error.
 *
 * Because the profile holds mutable versioning state in a closure, it is created
 * PER editor mount. The registry stores DESCRIPTORS with a `create()` factory
 * rather than shared singletons.
 *
 *   Descriptor: { id:string, detect(parsed)->bool, create()->Profile }
 *   Profile:    { id, import(parsed)->{value, model},
 *                 editPolicy:{ allowsStructuralEdits, allowsFreeText, wordLevelOnly, supportsAnnotations },
 *                 exporters:[{ id,label,ext,run() }],
 *                 versioning:{ snapshot,undo,redo,revertAll,canUndo,canRedo,currentOverlay },
 *                 reproject:()->value }
 */
import { whisperDescriptor } from './whisper-profile';

const registry = new Map();

export const registerProfile = (descriptor) => {
  if (!descriptor || typeof descriptor.id !== 'string' || typeof descriptor.create !== 'function') {
    throw new Error('registerProfile: expected a descriptor { id:string, detect, create }');
  }
  registry.set(descriptor.id, descriptor);
  return descriptor;
};

/** Look up a descriptor by id and return a FRESH profile instance (undefined if unknown). */
export const getProfile = (id) => {
  const descriptor = registry.get(id);
  return descriptor ? descriptor.create() : undefined;
};

/**
 * Return a fresh instance of the first registered profile whose detect() matches
 * `parsed`. Throws if nothing matches — an unrecognized transcript is a hard error
 * (only rev.ai or WhisperX are accepted).
 */
export const detectProfile = (parsed) => {
  for (const descriptor of registry.values()) {
    if (typeof descriptor.detect !== 'function') continue;
    try {
      if (descriptor.detect(parsed)) return descriptor.create();
    } catch (e) {
      // a misbehaving detector must never break detection
    }
  }
  throw new Error('detectProfile: unrecognized transcript — expected rev.ai (monologues) or WhisperX (segments + word_segments) JSON.');
};

/**
 * Resolve the component's `profile` prop into a profile instance:
 *  - an instance (object carrying editPolicy) -> returned as-is
 *  - a string id -> a fresh instance from the registry (the `whisper` profile if
 *    the id is unknown, including the legacy 'rigid'/'whisperx'/'classic' strings)
 *  - nullish -> a fresh `whisper` profile (format auto-detected at import time)
 */
export const resolveProfile = (profileProp) => {
  if (profileProp && typeof profileProp === 'object' && profileProp.editPolicy) {
    return profileProp;
  }
  if (typeof profileProp === 'string') {
    return getProfile(profileProp) || whisperDescriptor.create();
  }
  return whisperDescriptor.create();
};

registerProfile(whisperDescriptor);

export default { registerProfile, getProfile, detectProfile, resolveProfile };
