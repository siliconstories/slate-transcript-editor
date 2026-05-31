import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import PropTypes from 'prop-types';
import { PreferencesContext } from './PreferencesContext';
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  BUILTIN_PRESETS,
  PRESET_GROUPS,
  mergeSettings,
  applyBundleToSettings,
  bundleFromSettings,
  settingsMatchBundle,
  seedSettingsFromProps,
  freshDefaultSettings,
  migrate,
} from './defaults';

const isPresetGroup = (group) => PRESET_GROUPS.indexOf(group) !== -1;

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const loadPersisted = () => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch (e) {
    return null; // corrupt JSON / blocked storage -> fall back to defaults
  }
};

const savePersisted = (root) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch (e) {
    /* private mode / quota exceeded — ignore */
  }
};

// Built-in presets are code (not storage), so upgrades ship new built-ins; only
// custom presets are persisted and merged back in on load.
const mergePresets = (customPresets) => [...BUILTIN_PRESETS, ...(customPresets || []).filter((p) => p && !p.builtIn)];

const computeModified = (settings, presets, activePresetId) => {
  const active = presets.find((p) => p.id === activePresetId);
  return active ? !settingsMatchBundle(settings, active.bundle) : true;
};

let customSeq = 0;

export const PreferencesProvider = ({ children, seedProps, defaultPreferences, onPreferencesChange, hasConfidence = false }) => {
  const [state, setState] = useState(() => {
    const persisted = loadPersisted();
    if (persisted) {
      let settings = mergeSettings(DEFAULT_SETTINGS, persisted.settings);
      if (defaultPreferences) settings = mergeSettings(settings, defaultPreferences); // host override wins over persisted
      const presets = mergePresets(persisted.presets);
      const activePresetId = presets.some((p) => p.id === persisted.activePresetId) ? persisted.activePresetId : 'default';
      return { settings, presets, activePresetId, presetModified: computeModified(settings, presets, activePresetId) };
    }
    let settings = seedSettingsFromProps(seedProps);
    if (defaultPreferences) settings = mergeSettings(settings, defaultPreferences);
    const overlaySetExplicitly = Boolean(
      defaultPreferences && defaultPreferences.confidence && typeof defaultPreferences.confidence.overlay === 'boolean'
    );
    if (!overlaySetExplicitly) settings.confidence = { ...settings.confidence, overlay: Boolean(hasConfidence) };
    const presets = mergePresets([]);
    return { settings, presets, activePresetId: 'default', presetModified: computeModified(settings, presets, 'default') };
  });

  // Latest onPreferencesChange read at fire-time so an inline host callback does
  // not re-create/retrigger the persistence effect (mirrors the onSentenceModel fix).
  const onChangeRef = useRef(onPreferencesChange);
  useEffect(() => {
    onChangeRef.current = onPreferencesChange;
  });

  const persist = useMemo(
    () =>
      debounce((root) => {
        savePersisted(root);
        if (onChangeRef.current) onChangeRef.current(root);
      }, 400),
    []
  );

  useEffect(() => {
    persist({
      schemaVersion: SCHEMA_VERSION,
      settings: state.settings,
      presets: state.presets.filter((p) => !p.builtIn),
      activePresetId: state.activePresetId,
      presetModified: state.presetModified,
    });
  }, [state, persist]);

  useEffect(() => () => persist.cancel(), [persist]);

  const setField = useCallback((group, key, val) => {
    setState((prev) => {
      const settings = { ...prev.settings, [group]: { ...prev.settings[group], [key]: val } };
      const presetModified = isPresetGroup(group) ? computeModified(settings, prev.presets, prev.activePresetId) : prev.presetModified;
      return { ...prev, settings, presetModified };
    });
  }, []);

  const selectPreset = useCallback((id) => {
    setState((prev) => {
      const preset = prev.presets.find((p) => p.id === id);
      if (!preset) return prev;
      return { ...prev, settings: applyBundleToSettings(prev.settings, preset.bundle), activePresetId: id, presetModified: false };
    });
  }, []);

  const savePreset = useCallback(() => {
    setState((prev) => {
      const idx = prev.presets.findIndex((p) => p.id === prev.activePresetId);
      if (idx < 0 || prev.presets[idx].builtIn) return prev; // built-ins are read-only -> Save as…
      const presets = prev.presets.slice();
      presets[idx] = { ...presets[idx], bundle: bundleFromSettings(prev.settings) };
      return { ...prev, presets, presetModified: false };
    });
  }, []);

  const saveAsPreset = useCallback((name) => {
    setState((prev) => {
      customSeq += 1;
      const id = `custom-${Date.now()}-${customSeq}`;
      const preset = { id, name: (name && name.trim()) || `Custom ${customSeq}`, builtIn: false, bundle: bundleFromSettings(prev.settings) };
      return { ...prev, presets: [...prev.presets, preset], activePresetId: id, presetModified: false };
    });
  }, []);

  const deletePreset = useCallback((id) => {
    setState((prev) => {
      const target = prev.presets.find((p) => p.id === id);
      if (!target || target.builtIn) return prev;
      const presets = prev.presets.filter((p) => p.id !== id);
      if (prev.activePresetId !== id) return { ...prev, presets };
      const fallback = presets.find((p) => p.id === 'default') || presets[0];
      const settings = fallback ? applyBundleToSettings(prev.settings, fallback.bundle) : prev.settings;
      return { ...prev, presets, activePresetId: fallback ? fallback.id : null, settings, presetModified: false };
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setState((prev) => ({ ...prev, settings: freshDefaultSettings(hasConfidence), activePresetId: 'default', presetModified: false }));
  }, [hasConfidence]);

  const value = useMemo(
    () => ({
      settings: state.settings,
      presets: state.presets,
      activePresetId: state.activePresetId,
      presetModified: state.presetModified,
      hasConfidence,
      actions: { setField, selectPreset, savePreset, saveAsPreset, deletePreset, resetToDefaults },
    }),
    [state, hasConfidence, setField, selectPreset, savePreset, saveAsPreset, deletePreset, resetToDefaults]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

PreferencesProvider.propTypes = {
  children: PropTypes.node,
  seedProps: PropTypes.object,
  defaultPreferences: PropTypes.object,
  onPreferencesChange: PropTypes.func,
  hasConfidence: PropTypes.bool,
};

export default PreferencesProvider;
