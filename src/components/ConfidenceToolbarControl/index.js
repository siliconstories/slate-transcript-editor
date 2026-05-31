import React from 'react';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { usePreferences } from '../../preferences/PreferencesContext';

/**
 * Always-present quick override for the confidence overlay (on/off + word↔sentence).
 * Writes to the live confidence settings, which may diverge from the active preset
 * (marking it "modified"). Hidden when the transcript carries no confidence data.
 */
const ConfidenceToolbarControl = () => {
  const { settings, hasConfidence, actions } = usePreferences();
  if (!hasConfidence) return null;
  const c = settings.confidence;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Tooltip title={<Typography variant="body1">Highlight low-confidence words/sentences</Typography>}>
        <Typography variant="subtitle2" component="span" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Switch
            color="primary"
            size="small"
            checked={c.overlay === true}
            onChange={(e) => actions.setField('confidence', 'overlay', e.target.checked)}
          />
          Confidence
        </Typography>
      </Tooltip>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={c.level}
        disabled={c.overlay !== true}
        onChange={(e, level) => {
          if (level) actions.setField('confidence', 'level', level);
        }}
        aria-label="confidence overlay level"
      >
        <ToggleButton value="word" aria-label="word level">
          Word
        </ToggleButton>
        <ToggleButton value="sentence" aria-label="sentence level">
          Sentence
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
};

export default ConfidenceToolbarControl;
