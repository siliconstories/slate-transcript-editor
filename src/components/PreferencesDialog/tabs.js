import React from 'react';
import PropTypes from 'prop-types';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { usePreferences } from '../../preferences/PreferencesContext';
import SamplePreview from './SamplePreview';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const Row = ({ label, help, children }) => (
  <div style={{ margin: '14px 0' }}>
    <Typography variant="subtitle2" gutterBottom>
      {label}
    </Typography>
    {children}
    {help ? <FormHelperText>{help}</FormHelperText> : null}
  </div>
);
Row.propTypes = { label: PropTypes.string, help: PropTypes.node, children: PropTypes.node };

const clamp01 = (n) => (Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n)));

export const ConfidenceTab = () => {
  const { settings, actions } = usePreferences();
  const c = settings.confidence;
  const set = (key, val) => actions.setField('confidence', key, val);

  return (
    <div>
      <FormControlLabel
        control={<Switch color="primary" checked={c.overlay === true} onChange={(e) => set('overlay', e.target.checked)} />}
        label="Show the confidence overlay"
      />

      <Row label="Level">
        <ToggleButtonGroup size="small" exclusive value={c.level} onChange={(e, v) => v && set('level', v)}>
          <ToggleButton value="word">Word</ToggleButton>
          <ToggleButton value="sentence">Sentence</ToggleButton>
        </ToggleButtonGroup>
      </Row>

      {/* CUTOFF — the headline control. Words whose confidence is at or below the
          cutoff get a warm highlight; everything above it stays plain. 0.85 ≈ flag
          the bottom ~15% of model confidence (tune to taste). */}
      <Row
        label={`Cutoff — flag confidence ≤ ${c.cutoff.toFixed(2)}`}
        help="Words at or below this confidence are highlighted; higher cutoff flags more. 0.85 ≈ the bottom ~15% of model confidence."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Slider min={0} max={1} step={0.01} value={c.cutoff} onChange={(e, v) => set('cutoff', v)} style={{ flex: 1 }} aria-label="cutoff" />
          <TextField
            type="number"
            size="small"
            value={c.cutoff}
            onChange={(e) => set('cutoff', clamp01(Number(e.target.value)))}
            inputProps={{ min: 0, max: 1, step: 0.01, style: { width: 70 } }}
          />
        </div>
      </Row>

      <Row
        label={`Floor — full intensity at ${c.floor.toFixed(2)}`}
        help="Confidence at or below the floor is painted at maximum intensity; the heat ramps between floor and cutoff."
      >
        <Slider min={0} max={1} step={0.01} value={c.floor} onChange={(e, v) => set('floor', v)} aria-label="floor" />
      </Row>

      <Row label="Sentence metric" help="Used in sentence level: mean confidence, or duration-weighted (longer-spoken words count more).">
        <Select size="small" value={c.sentenceMetric} onChange={(e) => set('sentenceMetric', e.target.value)}>
          <MenuItem value="mean">Mean</MenuItem>
          <MenuItem value="duration_weighted">Duration-weighted</MenuItem>
        </Select>
      </Row>

      <Row label={`Highlight opacity — ${settings.appearance.highlightOpacity.toFixed(2)}`}>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={settings.appearance.highlightOpacity}
          onChange={(e, v) => actions.setField('appearance', 'highlightOpacity', v)}
          aria-label="opacity"
        />
      </Row>

      <Divider style={{ margin: '12px 0' }} />
      <Typography variant="caption" color="textSecondary">
        Live preview
      </Typography>
      <SamplePreview />
    </div>
  );
};

export const AppearanceTab = () => {
  const { settings, actions } = usePreferences();
  const a = settings.appearance;
  const d = settings.display;
  return (
    <div>
      <Row label={`Font size — ${a.fontSize}px`}>
        <Slider
          min={11}
          max={28}
          step={1}
          value={a.fontSize}
          onChange={(e, v) => actions.setField('appearance', 'fontSize', v)}
          aria-label="font size"
        />
      </Row>
      <Row label={`Line spacing — ${a.lineSpacing.toFixed(2)}`}>
        <Slider
          min={1}
          max={2.5}
          step={0.1}
          value={a.lineSpacing}
          onChange={(e, v) => actions.setField('appearance', 'lineSpacing', v)}
          aria-label="line spacing"
        />
      </Row>
      <Divider style={{ margin: '12px 0' }} />
      <FormControlLabel
        control={<Switch color="primary" checked={d.showSpeakers} onChange={(e) => actions.setField('display', 'showSpeakers', e.target.checked)} />}
        label="Show speakers"
      />
      <br />
      <FormControlLabel
        control={
          <Switch color="primary" checked={d.showTimecodes} onChange={(e) => actions.setField('display', 'showTimecodes', e.target.checked)} />
        }
        label="Show timecodes"
      />
      <br />
      <FormControlLabel
        control={
          <Switch
            color="primary"
            checked={d.showAnnotations === true}
            onChange={(e) => actions.setField('display', 'showAnnotations', e.target.checked)}
          />
        }
        label="Show segment annotations (WhisperX)"
      />
    </div>
  );
};

export const PlaybackTab = () => {
  const { settings, actions } = usePreferences();
  const p = settings.playback;
  return (
    <div>
      <FormControlLabel
        control={
          <Switch color="primary" checked={p.followPlayback} onChange={(e) => actions.setField('playback', 'followPlayback', e.target.checked)} />
        }
        label="Follow playback (highlight the spoken word)"
      />
      <Row label="Default playback speed">
        <Select size="small" value={p.playbackSpeed} onChange={(e) => actions.setField('playback', 'playbackSpeed', e.target.value)}>
          {PLAYBACK_SPEEDS.map((s) => (
            <MenuItem key={s} value={s}>
              x {s}
            </MenuItem>
          ))}
        </Select>
      </Row>
      <Row label="Seek step (seconds)" help="How far the rewind / fast-forward buttons jump.">
        <TextField
          type="number"
          size="small"
          value={p.seekStepSeconds}
          onChange={(e) => actions.setField('playback', 'seekStepSeconds', Math.max(1, Number(e.target.value) || 1))}
          inputProps={{ min: 1, max: 60, step: 1, style: { width: 80 } }}
        />
      </Row>
    </div>
  );
};

const EDITING_MODE_LABELS = { word: 'Word', freestyle: 'Freestyle', paragraph: 'Paragraph' };

export const EditingTab = ({ allowedModes, editingMode }) => {
  const { settings, actions } = usePreferences();
  const e = settings.editing;
  const modes = Array.isArray(allowedModes) && allowedModes.length ? allowedModes : ['freestyle', 'word'];
  const current = modes.includes(editingMode) ? editingMode : modes[0];
  return (
    <div>
      <Row
        label="Editing mode"
        help="Word: per-word seek, mute, and rewrite. Freestyle: free-text editing — timestamps re-align on the original words, inserted words get estimated timing."
      >
        <ToggleButtonGroup size="small" exclusive value={current} onChange={(ev, v) => v && actions.setField('editing', 'editingMode', v)}>
          {modes.map((m) => (
            <ToggleButton key={m} value={m}>
              {EDITING_MODE_LABELS[m] || m}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Row>
      <Row label="Auto-save format">
        <Select size="small" value={e.autoSaveContentType} onChange={(ev) => actions.setField('editing', 'autoSaveContentType', ev.target.value)}>
          <MenuItem value="digitalpaperedit">Digital Paper Edit (.json)</MenuItem>
          <MenuItem value="slate">Slate (.json)</MenuItem>
        </Select>
      </Row>
      <FormControlLabel
        control={
          <Switch
            color="primary"
            checked={e.pauseWhileTyping}
            onChange={(ev) => actions.setField('editing', 'pauseWhileTyping', ev.target.checked)}
          />
        }
        label="Pause media while typing"
      />
    </div>
  );
};
EditingTab.propTypes = { allowedModes: PropTypes.arrayOf(PropTypes.string), editingMode: PropTypes.string };

export const AboutResetTab = ({ profileId }) => {
  const { actions } = usePreferences();
  return (
    <div>
      <Row label="Transcript tier">
        <Typography variant="body2">
          {profileId === 'rigid'
            ? 'Rigid (rev.ai, faithful)'
            : profileId === 'whisperx'
              ? 'WhisperX (faithful, annotated)'
              : 'Classic (free-text DPE)'}
        </Typography>
      </Row>
      <Divider style={{ margin: '12px 0' }} />
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Restore all settings to their defaults (does not delete your saved presets).
      </Typography>
      <Button variant="outlined" color="secondary" onClick={() => actions.resetToDefaults()}>
        Reset to defaults
      </Button>
    </div>
  );
};
AboutResetTab.propTypes = { profileId: PropTypes.string };
