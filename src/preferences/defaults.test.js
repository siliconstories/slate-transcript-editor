import {
  DEFAULT_SETTINGS,
  BUILTIN_PRESETS,
  PRESET_GROUPS,
  mergeSettings,
  bundleFromSettings,
  applyBundleToSettings,
  settingsMatchBundle,
  seedSettingsFromProps,
  freshDefaultSettings,
  migrate,
  SCHEMA_VERSION,
} from './defaults';

describe('seedSettingsFromProps', () => {
  it('maps legacy props into the right groups without mutating DEFAULT_SETTINGS', () => {
    const s = seedSettingsFromProps({ showSpeakers: false, followPlayback: false, wordLevelEditing: true, autoSaveContentType: 'slate' });
    expect(s.display.showSpeakers).toBe(false);
    expect(s.playback.followPlayback).toBe(false);
    expect(s.editing.wordLevelEditing).toBe(true);
    expect(s.editing.autoSaveContentType).toBe('slate');
    // untouched defaults remain
    expect(s.display.showTimecodes).toBe(true);
    expect(DEFAULT_SETTINGS.display.showSpeakers).toBe(true); // not mutated
  });
});

describe('mergeSettings', () => {
  it('returns a fresh tree (mutating the result never touches base)', () => {
    const out = mergeSettings(DEFAULT_SETTINGS, { confidence: { cutoff: 0.7 } });
    out.confidence.cutoff = 0.1;
    expect(DEFAULT_SETTINGS.confidence.cutoff).toBe(0.85);
    expect(mergeSettings(DEFAULT_SETTINGS, { confidence: { cutoff: 0.7 } }).confidence.cutoff).toBe(0.7);
  });
});

describe('presets bundle/apply/match', () => {
  it('bundleFromSettings captures only the preset-scoped groups', () => {
    const b = bundleFromSettings(DEFAULT_SETTINGS);
    expect(Object.keys(b).sort()).toEqual([...PRESET_GROUPS].sort());
    expect(b.playback).toBeUndefined();
  });

  it('applyBundleToSettings changes preset groups but leaves global groups intact', () => {
    const start = mergeSettings(DEFAULT_SETTINGS, { playback: { playbackSpeed: 2 } });
    const out = applyBundleToSettings(start, BUILTIN_PRESETS.find((p) => p.id === 'clean-reading').bundle);
    expect(out.display.showTimecodes).toBe(false); // from preset
    expect(out.confidence.overlay).toBe(false); // from preset
    expect(out.playback.playbackSpeed).toBe(2); // global, untouched
  });

  it('settingsMatchBundle detects divergence in any preset group', () => {
    const def = BUILTIN_PRESETS.find((p) => p.id === 'default');
    expect(settingsMatchBundle(DEFAULT_SETTINGS, def.bundle)).toBe(true);
    const changed = mergeSettings(DEFAULT_SETTINGS, { confidence: { cutoff: 0.7 } });
    expect(settingsMatchBundle(changed, def.bundle)).toBe(false);
  });
});

describe('freshDefaultSettings', () => {
  it('defaults the overlay to whether confidence exists', () => {
    expect(freshDefaultSettings(true).confidence.overlay).toBe(true);
    expect(freshDefaultSettings(false).confidence.overlay).toBe(false);
  });
});

describe('migrate', () => {
  it('accepts a current-schema root and rejects everything else', () => {
    const ok = { schemaVersion: SCHEMA_VERSION, settings: DEFAULT_SETTINGS };
    expect(migrate(ok)).toBe(ok);
    expect(migrate(null)).toBeNull();
    expect(migrate({ schemaVersion: 999, settings: {} })).toBeNull();
    expect(migrate({ schemaVersion: SCHEMA_VERSION })).toBeNull(); // no settings
  });
});
