/**
 * TranscriptProfile registry. A profile decides how an imported transcript is
 * detected, converted to a Slate value, what edits are allowed, how it is
 * exported, and (optionally) how versioning/undo works. The editor stays
 * format-agnostic: it routes import / edit-gate / export / versioning through
 * the resolved profile. The default (no profile) IS the classic free-text DPE
 * tier, so the published component API is unchanged.
 *
 * Because some tiers (e.g. rigid) hold mutable versioning state in a closure, a
 * profile is created PER editor mount. The registry therefore stores DESCRIPTORS
 * with a `create()` factory rather than shared singletons.
 *
 *   Descriptor: { id:string, detect(parsed)->bool, create()->Profile }
 *   Profile:    { id, import(parsed)->{value, model},
 *                 editPolicy:{ allowsStructuralEdits, allowsFreeText, wordLevelOnly },
 *                 exporters:[{ id,label,ext,run() }] | null,
 *                 versioning:{ snapshot,undo,redo,revertAll,canUndo,canRedo,currentOverlay } | null,
 *                 reproject:()->value | null }
 */
import { classicDescriptor } from './classic-profile';
import { rigidDescriptor } from './rigid-profile';
import { whisperxDescriptor } from './whisperx-profile';

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
 * `parsed`, falling back to classic. (classic.detect is always true, so it is
 * skipped in the scan and used only as the explicit fallback.)
 */
export const detectProfile = (parsed) => {
  for (const descriptor of registry.values()) {
    if (descriptor.id === 'classic' || typeof descriptor.detect !== 'function') continue;
    try {
      if (descriptor.detect(parsed)) return descriptor.create();
    } catch (e) {
      // a misbehaving detector must never break detection
    }
  }
  return classicDescriptor.create();
};

/**
 * Resolve the component's `profile` prop into a profile instance:
 *  - an instance (object carrying editPolicy) -> returned as-is
 *  - a string id -> a fresh instance from the registry (classic if unknown)
 *  - nullish -> classic
 */
export const resolveProfile = (profileProp) => {
  if (profileProp && typeof profileProp === 'object' && profileProp.editPolicy) {
    return profileProp;
  }
  if (typeof profileProp === 'string') {
    return getProfile(profileProp) || classicDescriptor.create();
  }
  return classicDescriptor.create();
};

registerProfile(classicDescriptor);
registerProfile(rigidDescriptor);
registerProfile(whisperxDescriptor);

export default { registerProfile, getProfile, detectProfile, resolveProfile };
