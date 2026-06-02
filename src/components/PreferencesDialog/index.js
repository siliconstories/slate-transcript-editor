import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import { usePreferences } from '../../preferences/PreferencesContext';
import { ConfidenceTab, AppearanceTab, PlaybackTab, EditingTab, AboutResetTab } from './tabs';

// Preset selector + Save / Save as… / Delete, governing the preset-scoped tabs.
const PresetBar = () => {
  const { presets, activePresetId, presetModified, actions } = usePreferences();
  const [savingAs, setSavingAs] = useState(false);
  const [name, setName] = useState('');
  const active = presets.find((p) => p.id === activePresetId);
  const isBuiltIn = active ? active.builtIn : true;

  const confirmSaveAs = () => {
    if (!name.trim()) return;
    actions.saveAsPreset(name);
    setName('');
    setSavingAs(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: '#555' }}>Preset:</span>
      <Select size="small" value={activePresetId || ''} onChange={(e) => actions.selectPreset(e.target.value)}>
        {presets.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
            {p.builtIn ? '' : ' (custom)'}
          </MenuItem>
        ))}
      </Select>
      {presetModified ? <span style={{ fontSize: 12, color: '#b26a00' }}>(modified)</span> : null}
      {savingAs ? (
        <>
          <TextField
            size="small"
            autoFocus
            placeholder="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmSaveAs()}
          />
          <Button size="small" variant="contained" onClick={confirmSaveAs}>
            Save
          </Button>
          <Button size="small" onClick={() => setSavingAs(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Button size="small" disabled={isBuiltIn || !presetModified} onClick={() => actions.savePreset()}>
            Save
          </Button>
          <Button size="small" onClick={() => setSavingAs(true)}>
            Save as…
          </Button>
          <Button size="small" color="secondary" disabled={isBuiltIn} onClick={() => actions.deletePreset(activePresetId)}>
            Delete
          </Button>
        </>
      )}
    </div>
  );
};

const TAB_LABELS = ['Confidence', 'Appearance', 'Playback', 'Editing', 'About'];

const PreferencesDialog = ({ open, onClose, profileId, allowedModes, editingMode }) => {
  const [tab, setTab] = useState(0);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Preferences</DialogTitle>
      <div style={{ padding: '0 24px 10px' }}>
        <PresetBar />
      </div>
      <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {TAB_LABELS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      <DialogContent dividers>
        {tab === 0 && <ConfidenceTab />}
        {tab === 1 && <AppearanceTab />}
        {tab === 2 && <PlaybackTab />}
        {tab === 3 && <EditingTab allowedModes={allowedModes} editingMode={editingMode} />}
        {tab === 4 && <AboutResetTab profileId={profileId} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

PreferencesDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  profileId: PropTypes.string,
  allowedModes: PropTypes.arrayOf(PropTypes.string),
  editingMode: PropTypes.string,
};

export default PreferencesDialog;
