import React, { useMemo, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import findActiveWord from '../../util/find-active-word';

// window after the last click in which further clicks are collected, so we can
// tell single- / double- / triple-click apart
const MULTI_CLICK_DELAY_MS = 260;

/**
 * Read-only, word-granular transcript view.
 *
 * The base library renders each paragraph as one editable text blob; this view
 * instead renders every word as its own span so editing happens at exactly the
 * granularity the DPE/rev.ai JSON stores words in. Gestures:
 *   - single click     -> seek media to the word's start (no play-state change)
 *   - double click     -> edit just that word (inline input); commit writes words[i].text
 *   - alt/option click -> seek to the word and toggle play/pause
 *   - ctrl/cmd click   -> toggle muted (adds `muted: true` to the word; strikethrough)
 *
 * It edits the Slate `value` directly via setValue (no stt-align pass), so other
 * words' custom props (incl. `muted`) are preserved, and the slate->dpe save
 * round-trip keeps everything because word count per paragraph never changes.
 */
function WordLevelEditor({
  value,
  setValue,
  isEditable,
  showSpeakers,
  showTimecodes,
  currentTime,
  followPlayback,
  onSeek,
  onSeekAndPlay,
  onSeekAndTogglePlay,
  onContentChange,
  onSetSpeakerName,
  onShowRawSource,
}) {
  const [editing, setEditing] = useState(null); // { pIdx, wIdx }
  const [draft, setDraft] = useState('');
  const clickTimer = useRef(null);
  const clickCount = useRef(0);

  // active word for the "follow the speech" highlight, computed over a flat,
  // time-sorted list that points back to (pIdx, wIdx).
  const flatWords = useMemo(() => {
    const flat = [];
    value.forEach((paragraph, pIdx) => {
      const words = paragraph && paragraph.children && Array.isArray(paragraph.children[0].words) ? paragraph.children[0].words : [];
      words.forEach((word, wIdx) => {
        if (typeof word.text === 'string' && word.text.length > 0) {
          flat.push({ pIdx, wIdx, start: typeof word.start === 'number' ? word.start : 0 });
        }
      });
    });
    flat.sort((a, b) => a.start - b.start);
    return flat;
  }, [value]);

  const activeWord = useMemo(() => {
    if (!followPlayback) return null;
    const i = findActiveWord(flatWords, currentTime);
    return i >= 0 ? flatWords[i] : null;
  }, [followPlayback, flatWords, currentTime]);

  const updateWord = useCallback(
    (pIdx, wIdx, changes) => {
      const newValue = value.map((paragraph, pi) => {
        if (pi !== pIdx) return paragraph;
        const child = paragraph.children[0];
        const words = child.words.map((word, wi) => (wi === wIdx ? { ...word, ...changes } : word));
        const text = words.map((word) => (typeof word.text === 'string' ? word.text : '') + (word.punctAfter || '')).join(' ');
        return { ...paragraph, children: [{ ...child, words, text }] };
      });
      setValue(newValue);
      if (onContentChange) onContentChange(newValue);
    },
    [value, setValue, onContentChange]
  );

  const beginEdit = (pIdx, wIdx, word) => {
    if (isEditable === false) return;
    setEditing({ pIdx, wIdx });
    setDraft(typeof word.text === 'string' ? word.text : '');
  };

  const commitEdit = () => {
    if (!editing) return;
    updateWord(editing.pIdx, editing.wIdx, { text: draft });
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  // Disambiguate the click, then act once the click burst ends:
  //   1 click            -> seek only, do NOT change play state
  //   2+ clicks          -> edit this word
  //   Alt/Option + click -> seek to the word and toggle play/pause (immediate)
  //   Ctrl/Cmd + click   -> toggle muted (immediate)
  const handleWordClick = (e, pIdx, wIdx, word) => {
    if (e.ctrlKey || e.metaKey) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      clickCount.current = 0;
      if (isEditable !== false) updateWord(pIdx, wIdx, { muted: !word.muted });
      return;
    }
    if (e.altKey) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      clickCount.current = 0;
      if (onSeekAndTogglePlay && typeof word.start === 'number') onSeekAndTogglePlay(word.start);
      return;
    }
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      const count = clickCount.current;
      clickCount.current = 0;
      clickTimer.current = null;
      if (count >= 2) {
        beginEdit(pIdx, wIdx, word);
      } else {
        if (onSeek && typeof word.start === 'number') onSeek(word.start);
      }
    }, MULTI_CLICK_DELAY_MS);
  };

  const renderWord = (paragraph, pIdx, word, wIdx) => {
    const text = typeof word.text === 'string' ? word.text : '';
    if (text.length === 0) return null;
    const isEditingThis = editing && editing.pIdx === pIdx && editing.wIdx === wIdx;
    if (isEditingThis) {
      return (
        <React.Fragment key={wIdx}>
          <span className="stw-edit-wrap">
            <span className="stw-edit-tools" contentEditable={false}>
              <button
                type="button"
                className="stw-mute-btn"
                aria-pressed={Boolean(word.muted)}
                // mousedown-preventDefault keeps the input focused, so its onBlur
                // (commit) doesn't fire and unmount this button before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  updateWord(pIdx, wIdx, { muted: !word.muted });
                  setEditing(null);
                }}
                title={word.muted ? 'Unmute this word' : 'Mute this word (removed on export)'}
              >
                {word.muted ? 'Unmute' : 'Mute'}
              </button>
              {onShowRawSource && (
                <button
                  type="button"
                  className="stw-raw-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    cancelEdit();
                    onShowRawSource({ key: word._key, start: word.start });
                  }}
                  title="Edit the raw source document (JSON)"
                >
                  Raw…
                </button>
              )}
            </span>
            <input
              className="stw-word-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              size={Math.max(draft.length, 2)}
            />
          </span>
          {word.punctAfter ? <span className="stw-punct">{word.punctAfter}</span> : null}{' '}
        </React.Fragment>
      );
    }
    const isActive = activeWord && activeWord.pIdx === pIdx && activeWord.wIdx === wIdx;
    let className = 'stw-word';
    if (word.muted) className += ' stw-muted';
    if (isActive) className += ' current-word';
    return (
      <React.Fragment key={wIdx}>
        <span
          className={className}
          role="button"
          tabIndex={0}
          title={isEditable === false ? undefined : 'Click: seek · Double-click: edit · Alt/Opt-click: play/pause · Ctrl/Cmd-click: mute'}
          onClick={(e) => handleWordClick(e, pIdx, wIdx, word)}
        >
          {text}
        </span>
        {word.punctAfter ? <span className="stw-punct">{word.punctAfter}</span> : null}{' '}
      </React.Fragment>
    );
  };

  return (
    <div className="stw-word-level">
      {value.map((paragraph, pIdx) => {
        const child = paragraph.children && paragraph.children[0] ? paragraph.children[0] : { words: [] };
        const words = Array.isArray(child.words) ? child.words : [];
        return (
          <Grid container direction="row" justifyContent="flex-start" alignItems="flex-start" key={pIdx} className="stw-paragraph">
            {showTimecodes && (
              <Grid item xs={4} sm={3} md={3} lg={2} xl={2} className={'p-t-2 text-truncate'}>
                <code
                  className={'timecode text-muted unselectable'}
                  style={{ cursor: 'pointer' }}
                  title={paragraph.startTimecode}
                  onClick={() => onSeekAndPlay && onSeekAndPlay(paragraph.start)}
                >
                  {paragraph.startTimecode}
                </code>
              </Grid>
            )}
            {showSpeakers && (
              <Grid item xs={8} sm={9} md={9} lg={3} xl={3} className={'p-t-2 text-truncate'}>
                <Typography
                  noWrap
                  className={'text-truncate text-muted unselectable'}
                  style={{ cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}
                  title={paragraph.speaker}
                  onClick={() => onSetSpeakerName && onSetSpeakerName(paragraph)}
                >
                  {paragraph.speaker}
                </Typography>
              </Grid>
            )}
            <Grid item xs={12} sm={12} md={12} lg={showSpeakers || showTimecodes ? 7 : 12} xl={7} className={'p-b-1'}>
              {words.map((word, wIdx) => renderWord(paragraph, pIdx, word, wIdx))}
            </Grid>
          </Grid>
        );
      })}
    </div>
  );
}

WordLevelEditor.propTypes = {
  value: PropTypes.array.isRequired,
  setValue: PropTypes.func.isRequired,
  isEditable: PropTypes.bool,
  showSpeakers: PropTypes.bool,
  showTimecodes: PropTypes.bool,
  currentTime: PropTypes.number,
  followPlayback: PropTypes.bool,
  onSeek: PropTypes.func,
  onSeekAndPlay: PropTypes.func,
  onSeekAndTogglePlay: PropTypes.func,
  onContentChange: PropTypes.func,
  onSetSpeakerName: PropTypes.func,
  onShowRawSource: PropTypes.func,
};

export default WordLevelEditor;
