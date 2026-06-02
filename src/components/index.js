import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import path from 'path';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import debounce from 'lodash/debounce';
import { createEditor, Editor, Transforms, Text, Range, Element as SlateElement } from 'slate';
// https://docs.slatejs.org/walkthroughs/01-installing-slate
// Import the Slate components and React plugin.
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';

import EditorToolbar from './EditorToolbar';
import FilesPanel from './FilesPanel';
import { shortTimecode } from '../util/timecode-converter';
import download from '../util/downlaod/index.js';
// TODO: This should be moved in export utils
import insertTimecodesInLineInSlateJs from '../util/insert-timecodes-in-line-in-words-list';
import pluck from '../util/pluk';
import plainTextalignToSlateJs from '../util/export-adapters/slate-to-dpe/update-timestamps/plain-text-align-to-slate';
import updateBloocksTimestamps from '../util/export-adapters/slate-to-dpe/update-timestamps/update-bloocks-timestamps';
import exportAdapter, { isCaptionType } from '../util/export-adapters';
import generatePreviousTimingsUpToCurrent from '../util/dpe-to-slate/generate-previous-timings-up-to-current';
import buildWordMap from '../util/build-word-map';
import findActiveWord from '../util/find-active-word';
import stripMutedWords from '../util/strip-muted-words';
import Chip from '@mui/material/Chip';
import SlateHelpers from './slate-helpers';
import { resolveProfile } from '../transcript-model/profile';
import { whisperToModel, newHistory } from '../transcript-model/whisper-overlay';
import { whisperModelToSlate } from '../transcript-model/whisper-to-slate';
import { whisperConfidenceDefaults } from '../transcript-model/whisper-profile';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { usePreferences } from '../preferences/PreferencesContext';
import buildConfidenceDecorations from '../util/confidence-decorations';
import buildProvenanceDecorations from '../util/provenance-decorations';
import buildStyleDecorations from '../util/style-decorations';
import selectionToStyleRanges from '../util/selection-to-style-range';
import { alignParagraph } from '../transcript-model/align-paragraph';
import { tokenToLeafWord } from '../transcript-model/freetext-to-slate';
import { confidenceOf, groupSlateWordsIntoSentences } from '../util/rev-to-sentences';
import { confidenceToStyle } from '../util/confidence-scale';
import PreferencesDialog from './PreferencesDialog';
import '../styles/toolbar.css';

const PLAYBACK_RATE_VALUES = [0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5];
const MEDIA_TOGGLE_STYLE = {
  border: '1px solid #d4d4d8',
  background: '#fff',
  color: '#71717a',
  borderRadius: 6,
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Inter, Roboto, system-ui, sans-serif',
};
const CIRCLE_BTN_STYLE = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  border: '1px solid #d4d4d8',
  background: '#fff',
  color: '#18181b',
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontWeight: 700,
  fontSize: 11,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
};
const PLAY_BTN_STYLE = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: 'none',
  background: '#18181b',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: 1,
  flex: '0 0 auto',
};
const PAUSE_WHILTE_TYPING_TIMEOUT_MILLISECONDS = 1500;
// const MAX_DURATION_FOR_PERFORMANCE_OPTIMIZATION_IN_SECONDS = 3600;
const REPLACE_WHOLE_TEXT_INSTRUCTION =
  'Replace whole text. \n\nAdvanced feature, if you already have an accurate transcription for the whole text, and you want to restore timecodes for it, you can use this to replace the text in this transcript. \n\nFor now this is an experimental feature. \n\nIt expects plain text, with paragraph breaks as new line breaks but no speakers.';

const pauseWhileTypeing = (current) => {
  current.play();
};
const debouncePauseWhileTyping = debounce(pauseWhileTypeing, PAUSE_WHILTE_TYPING_TIMEOUT_MILLISECONDS);

// Shallow compare two leaf word arrays (anchor + text + timing) to skip no-op setNodes.
const freestyleWordsEqual = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if ((x._key == null ? null : x._key) !== (y._key == null ? null : y._key) || x.text !== y.text || x.start !== y.start || x.end !== y.end)
      return false;
  }
  return true;
};

// Freestyle invariant: every `timedText` paragraph must keep EXACTLY ONE text leaf
// carrying `text` + `words[]`. Paste/IME can split the leaf into several text nodes
// (with diverging `words`), which would break the words↔text mapping the overlay
// derivation relies on. This normalizer collapses any such split back into a single
// leaf (keeping the first leaf's `words`; the next commit re-aligns them).
const withSingleLeafParagraphs = (editor) => {
  const { normalizeNode } = editor;
  editor.normalizeNode = (entry) => {
    const [node, path] = entry;
    if (SlateElement.isElement(node) && node.type === 'timedText' && Array.isArray(node.children) && node.children.length > 1) {
      const allText = node.children.every((c) => typeof c.text === 'string');
      if (allText) {
        const text = node.children.map((c) => c.text).join('');
        const firstWords = node.children[0] && node.children[0].words;
        Transforms.insertNodes(editor, { text, ...(firstWords ? { words: firstWords } : {}) }, { at: [...path, 0] });
        for (let i = node.children.length; i >= 1; i -= 1) Transforms.removeNodes(editor, { at: [...path, i] });
        return;
      }
    }
    normalizeNode(entry);
  };
  return editor;
};

// React 19 ignores `Component.defaultProps` on function components, so the defaults
// are merged here instead. Matters most for `isEditable`, which several reads consume
// directly (props.isEditable) with no inline fallback — without this it would default
// to non-editable under React 19.
const DEFAULT_PROPS = {
  showTitle: false,
  showTimecodes: true,
  showSpeakers: true,
  autoSaveContentType: 'digitalpaperedit',
  isEditable: true,
  followPlayback: true,
  wordLevelEditing: false,
  editingMode: 'auto',
};

// Per-segment annotation chips (topic / mood / sentiment / concept tags), rendered
// inside the shared TimedTextElement so they appear identically in both modes.
function AnnotationChips({ annotations }) {
  if (!annotations) return null;
  return (
    <div
      className="stw-annotations unselectable"
      contentEditable={false}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 }}
    >
      {annotations.topicLabel && <Chip size="small" variant="outlined" color="primary" label={annotations.topicLabel} />}
      {annotations.mood && <Chip size="small" variant="outlined" label={`mood: ${annotations.mood}`} />}
      {annotations.sentiment && <Chip size="small" variant="outlined" label={`sentiment: ${annotations.sentiment}`} />}
      {(annotations.conceptTags || []).map((tag) => (
        <Chip key={tag} size="small" variant="outlined" label={tag} sx={{ color: '#757575', borderColor: '#e0e0e0' }} />
      ))}
    </div>
  );
}
AnnotationChips.propTypes = { annotations: PropTypes.object };

// Strict-mode single-word editor: the inline editor from the old word grid (the input
// in place, with small "Mute"/"Raw…" tools above it), floated at the double-clicked word
// so it works over the read-only single Slate surface. Commits on Enter/blur; Esc cancels.
function StrictWordPopover({ state, onDraft, onSave, onToggleMute, onShowRaw, onCancel }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const left = Math.max(8, Math.min(state.x, vw - 200));
  const top = state.y;
  // Near the viewport top the tools (normally above the input) would clip — flip them
  // below, mirroring the old grid's first-paragraph handling.
  const toolsBelow = top < 70;
  return (
    <span className="stw-edit-wrap" contentEditable={false} style={{ position: 'fixed', left, top, zIndex: 1400 }}>
      <span
        className="stw-edit-tools"
        contentEditable={false}
        style={toolsBelow ? { bottom: 'auto', top: '100%', marginTop: 3, marginBottom: 0 } : undefined}
      >
        <button
          type="button"
          className="stw-mute-btn"
          aria-pressed={state.muted}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleMute}
          title={state.muted ? 'Unmute this word' : 'Mute this word (removed on export)'}
        >
          {state.muted ? 'Unmute' : 'Mute'}
        </button>
        {onShowRaw && (
          <button
            type="button"
            className="stw-raw-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onShowRaw}
            title="Edit the raw source document (JSON)"
          >
            Raw…
          </button>
        )}
      </span>
      <input
        className="stw-word-input"
        autoFocus
        value={state.draft}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        size={Math.max(state.draft.length, 2)}
      />
    </span>
  );
}
StrictWordPopover.propTypes = {
  state: PropTypes.object,
  onDraft: PropTypes.func,
  onSave: PropTypes.func,
  onToggleMute: PropTypes.func,
  onShowRaw: PropTypes.func,
  onCancel: PropTypes.func,
};

function SlateTranscriptEditorInner(props) {
  props = { ...DEFAULT_PROPS, ...props };
  const { settings, actions, presets, activePresetId } = usePreferences();
  const seekStepSeconds = settings.playback.seekStepSeconds;
  const forwardStepSeconds = settings.playback.forwardStepSeconds;
  const [prefsOpen, setPrefsOpen] = useState(false);
  // Video|Files view tabs — only shown when the host supplies a `files` list.
  const [activeTab, setActiveTab] = useState('video');
  // Collapse the left media column to give the transcript full width.
  const [mediaCollapsed, setMediaCollapsed] = useState(false);
  const hasFiles = Array.isArray(props.files) && props.files.length > 0;

  // Editing is prop-seeded but toggled in-UI via the toolbar's Edit-Lock. Seed from
  // props.isEditable, then sync through when the host changes that prop (mirrors the
  // controlled-prop pattern used for display/confidence prefs just below).
  const [editable, setEditable] = useState(props.isEditable !== false);
  const prevIsEditableRef = useRef(props.isEditable);
  useEffect(() => {
    if (props.isEditable !== prevIsEditableRef.current) {
      setEditable(props.isEditable !== false);
      prevIsEditableRef.current = props.isEditable;
    }
  }, [props.isEditable]);

  // Host props are controlled inputs: when one CHANGES, write it through to prefs
  // (the single source the UI renders from), so a host toggling showSpeakers/etc.
  // — or the demo's confidence checkbox via defaultPreferences — still drives the
  // editor. Compared per-key against the previous render so prefs-dialog edits
  // (which never change props) are never clobbered.
  const dp = props.defaultPreferences || {};
  const hostControlled = {
    'display.showSpeakers': typeof props.showSpeakers === 'boolean' ? props.showSpeakers : undefined,
    'display.showTimecodes': typeof props.showTimecodes === 'boolean' ? props.showTimecodes : undefined,
    'display.showTitle': typeof props.showTitle === 'boolean' ? props.showTitle : undefined,
    'playback.followPlayback': typeof props.followPlayback === 'boolean' ? props.followPlayback : undefined,
    'editing.wordLevelEditing': typeof props.wordLevelEditing === 'boolean' ? props.wordLevelEditing : undefined,
    'editing.editingMode': typeof props.editingMode === 'string' && props.editingMode !== 'auto' ? props.editingMode : undefined,
    'editing.autoSaveContentType': typeof props.autoSaveContentType === 'string' ? props.autoSaveContentType : undefined,
    'confidence.overlay': dp.confidence && typeof dp.confidence.overlay === 'boolean' ? dp.confidence.overlay : undefined,
    'confidence.level': dp.confidence && (dp.confidence.level === 'word' || dp.confidence.level === 'sentence') ? dp.confidence.level : undefined,
    'confidence.cutoff': dp.confidence && typeof dp.confidence.cutoff === 'number' ? dp.confidence.cutoff : undefined,
  };
  const prevControlledRef = useRef(hostControlled);
  useEffect(() => {
    const prev = prevControlledRef.current;
    Object.keys(hostControlled).forEach((key) => {
      const val = hostControlled[key];
      if (typeof val !== 'undefined' && val !== prev[key]) {
        const dot = key.indexOf('.');
        actions.setField(key.slice(0, dot), key.slice(dot + 1), val);
      }
    });
    prevControlledRef.current = hostControlled;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(settings.playback.playbackSpeed);
  const editor = useMemo(() => withSingleLeafParagraphs(withReact(withHistory(createEditor()))), []);
  // Per-instance media element ref (was a module-scope React.createRef(), which is
  // shared across every mounted editor — a latent multi-instance bug).
  const mediaRef = useRef(null);
  // The active transcript profile decides import / edit-gate / export / versioning.
  // No `profile` prop => classic free-text DPE tier => the editor's original behavior.
  const profile = useMemo(() => resolveProfile(props.profile), [props.profile]);
  const editPolicy = profile.editPolicy;

  // Latest onSentenceModel callback, read at debounce-fire time so an inline host
  // callback (a new function identity every render) does NOT re-create the emitter
  // and retrigger the effect below — which would loop emits forever.
  const onSentenceModelRef = useRef(props.onSentenceModel);
  useEffect(() => {
    onSentenceModelRef.current = props.onSentenceModel;
  });

  // Sentence-level "shadow" emit (rigid only): debounced so rapid word edits
  // coalesce into one onSentenceModel call. Null when the host doesn't request
  // it or the active profile has no sentence exporter (e.g. classic free-text).
  const wantsSentenceModel = Boolean(props.onSentenceModel);
  const emitSentenceModel = useMemo(() => {
    const sentenceExporter = (profile.exporters || []).find((e) => typeof e.id === 'string' && e.id.endsWith('-sentences'));
    if (!wantsSentenceModel || !sentenceExporter) return null;
    return debounce(() => {
      const model = sentenceExporter.run();
      const onSentenceModel = onSentenceModelRef.current;
      if (model && onSentenceModel) onSentenceModel(model);
    }, 300);
  }, [profile, wantsSentenceModel]);

  // One-shot initial emit; cancel any pending debounce on unmount / profile swap.
  useEffect(() => {
    if (emitSentenceModel) emitSentenceModel();
    return () => {
      if (emitSentenceModel) emitSentenceModel.cancel();
    };
  }, [emitSentenceModel]);
  const [value, setValue] = useState([]);
  // slate-react 0.95+ reads `<Slate initialValue>` once at mount; it is no longer a
  // controlled `value`. Programmatic whole-document replacements (replace-text,
  // restore-timecodes, rigid undo/redo reproject) bump this key to remount <Slate>
  // so it re-reads initialValue. See replaceSlateValue below.
  const [slateKey, setSlateKey] = useState(0);
  // Derived from props every render (not copied into state) so the component is
  // controlled: toggling these props shows/hides speakers & timecodes live, without
  // a remount — which matters for the rigid tier (a remount would wipe overlay edits).
  const showSpeakers = settings.display.showSpeakers;
  const showTimecodes = settings.display.showTimecodes;
  // Read-only per-segment annotation chips, rendered by WordLevelEditor (the
  // surface every word-level-only tier uses). No-op for paragraphs that carry no
  // `annotations` (classic/rigid), so the toggle is effectively WhisperX-only.
  const showAnnotations = settings.display.showAnnotations;
  const [speakerOptions, setSpeakerOptions] = useState([]);
  const [saveTimer, setSaveTimer] = useState(null);
  const [isPauseWhiletyping, setIsPauseWhiletyping] = useState(settings.editing.pauseWhileTyping);
  const [isProcessing, setIsProcessing] = useState(false);
  // used isContentModified to avoid unecessarily run alignment if the slate value contnet has not been modified by the user since
  // last save or alignment
  const [isContentModified, setIsContentIsModified] = useState(false);
  const [isContentSaved, setIsContentSaved] = useState(true);

  // Revert restore points: the originally-imported doc (snapshot on mount) and the
  // last-saved doc (snapshot in handleSave). Cloned on use so Slate never shares refs.
  const importedValueRef = useRef(null);
  const lastSavedValueRef = useRef(null);
  const cloneValue = (v) => (v ? JSON.parse(JSON.stringify(v)) : v);

  // Replace the whole Slate document programmatically. Under slate-react 0.124
  // setting `value` state no longer drives the mounted editor (initialValue is read
  // once), so we clear the now-stale selection and remount <Slate> via slateKey,
  // which re-runs `editor.children = initialValue` with the new value.
  const replaceSlateValue = useCallback(
    (newValue) => {
      setValue(newValue);
      editor.selection = null;
      setSlateKey((k) => k + 1);
    },
    [editor]
  );

  useEffect(() => {
    if (isProcessing) {
      document.body.style.cursor = 'wait';
    } else {
      document.body.style.cursor = 'default';
    }
  }, [isProcessing]);

  useEffect(() => {
    if (props.transcriptData) {
      try {
        const { value: importedValue } = profile.import(props.transcriptData);
        setValue(importedValue);
        importedValueRef.current = cloneValue(importedValue);
        lastSavedValueRef.current = cloneValue(importedValue);
        // a re-imported editing-session file carries user styles in its overlay
        setStyleRanges(profile.versioning && profile.versioning.getStyles ? profile.versioning.getStyles() : []);
      } catch (e) {
        // Unrecognized transcript (not rev.ai or WhisperX) is a hard error — surface it
        // loudly and leave the editor empty rather than crashing the host React tree.
        // eslint-disable-next-line no-console
        console.error('[SlateTranscriptEditor] import failed:', e && e.message ? e.message : e);
      }
    }
  }, []);

  const handleRevertToSaved = () => {
    if (!lastSavedValueRef.current) return;
    replaceSlateValue(cloneValue(lastSavedValueRef.current));
    setIsContentIsModified(false);
    setIsContentSaved(true);
  };

  const handleRevertToImported = () => {
    if (profile.versioning && profile.versioning.revertAll && profile.reproject) {
      profile.versioning.revertAll();
      replaceSlateValue(profile.reproject());
      refreshStyles();
    } else if (importedValueRef.current) {
      replaceSlateValue(cloneValue(importedValueRef.current));
    }
    lastSavedValueRef.current = cloneValue(importedValueRef.current);
    setIsContentIsModified(false);
    setIsContentSaved(true);
  };

  // handles interim results for worrking with a Live STT
  useEffect(() => {
    if (props.transcriptDataLive) {
      // Live chunks are rev.ai/WhisperX fragments — project them straight to Slate
      // nodes for append (display-only; not threaded through the overlay/history).
      const nodes = whisperModelToSlate(whisperToModel(props.transcriptDataLive), newHistory());
      // if the user is selecting the / typing the text
      // Transforms.insertNodes would insert the node at seleciton point
      // instead we check if they are in the editor
      if (editor.selection) {
        // get the position of the last node
        const positionLastNode = [editor.children.length];
        // insert the new nodes at the end of the document
        Transforms.insertNodes(editor, nodes, {
          at: positionLastNode,
        });
      }
      // use not having selection in the editor allows us to also handle the initial use case
      // where the might be no initial results
      else {
        // if there is no selection the default for insertNodes is to add the nodes at the end
        Transforms.insertNodes(editor, nodes);
      }
    }
  }, [props.transcriptDataLive]);

  useEffect(() => {
    const getUniqueSpeakers = pluck('speaker');
    const uniqueSpeakers = getUniqueSpeakers(value);
    setSpeakerOptions(uniqueSpeakers);
  }, [value]);

  //  useEffect(() => {
  //    const getUniqueSpeakers = pluck('speaker');
  //    const uniqueSpeakers = getUniqueSpeakers(value);
  //    setSpeakerOptions(uniqueSpeakers);
  //  }, [showSpeakersCheatShet]);

  useEffect(() => {
    // Update the document title using the browser API
    if (mediaRef && mediaRef.current) {
      // setDuration(mediaRef.current.duration);
      mediaRef.current.addEventListener('timeupdate', handleTimeUpdated);
    }
    return function cleanup() {
      // removeEventListener
      if (mediaRef && mediaRef.current) {
        mediaRef.current.removeEventListener('timeupdate', handleTimeUpdated);
      }
    };
  }, []);

  useEffect(() => {}, [currentTime]);

  // useEffect(() => {
  //   // Update the document title using the browser API
  //   if (mediaRef && mediaRef.current) {
  //     // Not working
  //     setDuration(mediaRef.current.duration);
  //     if (mediaRef.current.duration >= MAX_DURATION_FOR_PERFORMANCE_OPTIMIZATION_IN_SECONDS) {
  //       setShowSpeakers(false);
  //       showTimecodes(false);
  //     }
  //   }
  // }, [mediaRef]);

  const insertTextInaudible = () => {
    Transforms.insertText(editor, '[INAUDIBLE]');
    if (props.handleAnalyticsEvents) {
      props.handleAnalyticsEvents('ste_clicked_on_insert', {
        btn: '[INAUDIBLE]',
        fn: 'insertTextInaudible',
      });
    }
  };

  const handleInsertMusicNote = () => {
    Transforms.insertText(editor, '♪'); // or ♫
    if (props.handleAnalyticsEvents) {
      props.handleAnalyticsEvents('ste_clicked_on_insert', {
        btn: '♫',
        fn: 'handleInsertMusicNote',
      });
    }
  };

  const getSlateContent = () => {
    return value;
  };

  const getFileName = () => {
    return path.basename(props.mediaUrl).trim();
  };
  const getFileTitle = () => {
    if (props.title) {
      return props.title;
    }
    return getFileName();
  };

  const handleTimeUpdated = (e) => {
    setCurrentTime(e.target.currentTime);
    // TODO: setting duration here as a workaround
    setDuration(mediaRef.current.duration);
    //  TODO: commenting this out for now, not sure if it will fire to often?
    // if (props.handleAnalyticsEvents) {
    //   // handles if click cancel and doesn't set speaker name
    //   props.handleTimeUpdated('ste_handle_time_update', {
    //     fn: 'handleTimeUpdated',
    //     duration: mediaRef.current.duration,
    //     currentTime: e.target.currentTime,
    //   });
    // }
  };

  const handleSetPlaybackRate = (e) => {
    const previousPlaybackRate = playbackRate;
    const n = e.target.value;
    const tmpNewPlaybackRateValue = parseFloat(n);
    if (mediaRef && mediaRef.current) {
      mediaRef.current.playbackRate = tmpNewPlaybackRateValue;
      setPlaybackRate(tmpNewPlaybackRateValue);

      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_set_playback_rate', {
          fn: 'handleSetPlaybackRate',
          previousPlaybackRate,
          newPlaybackRate: tmpNewPlaybackRateValue,
        });
      }
    }
  };

  const handlePlayPause = () => {
    if (mediaRef && mediaRef.current) {
      if (mediaRef.current.paused) {
        mediaRef.current.play();
      } else {
        mediaRef.current.pause();
      }
    }
  };

  const handleSeekBack = () => {
    if (mediaRef && mediaRef.current) {
      const newCurrentTime = mediaRef.current.currentTime - seekStepSeconds;
      mediaRef.current.currentTime = newCurrentTime;

      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_seek_back', {
          fn: 'handleSeekBack',
          newCurrentTimeInSeconds: newCurrentTime,
          seekBackValue: seekStepSeconds,
        });
      }
    }
  };

  const handleFastForward = () => {
    if (mediaRef && mediaRef.current) {
      const newCurrentTime = mediaRef.current.currentTime + forwardStepSeconds;
      mediaRef.current.currentTime = newCurrentTime;

      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_fast_forward', {
          fn: 'handleFastForward',
          newCurrentTimeInSeconds: newCurrentTime,
          seekBackValue: forwardStepSeconds,
        });
      }
    }
  };

  const followPlayback = settings.playback.followPlayback;
  // Editing mode: the profile declares the modes it allows (rev.ai/whisperx ->
  // ['word','freestyle'] default 'word'; classic -> ['freestyle','word'] default
  // 'freestyle'). 'auto' (and any out-of-range request) defers to the profile default.
  const editingModes =
    Array.isArray(editPolicy.modes) && editPolicy.modes.length ? editPolicy.modes : editPolicy.wordLevelOnly ? ['word'] : ['freestyle'];
  const requestedMode = settings.editing.editingMode;
  const editingMode =
    requestedMode && requestedMode !== 'auto' && editingModes.includes(requestedMode) ? requestedMode : editPolicy.defaultMode || editingModes[0];
  const wordLevelEditing = editingMode === 'word';
  // Freestyle is the diff-anchored free-text editor — only on a versioned strict tier.
  const isFreestyle = editingMode === 'freestyle' && !!(profile.versioning && typeof profile.versioning.snapshotFreeText === 'function');
  // The toolbar Word|Freestyle switch is strict-only (a versioned profile with >1 mode).
  const showEditingModeSwitch = editingModes.length > 1 && !!profile.versioning;
  const onEditingModeChange = (m) => actions.setField('editing', 'editingMode', m);

  // alt/option-click on a word: jump to it and toggle play/pause
  const seekAndTogglePlayWord = (seconds) => {
    if (mediaRef && mediaRef.current && typeof seconds === 'number') {
      mediaRef.current.currentTime = seconds;
      if (mediaRef.current.paused) {
        mediaRef.current.play();
      } else {
        mediaRef.current.pause();
      }
      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_timed_text_click', {
          fn: 'wordLevelTogglePlay',
          clickOrigin: 'word',
          timeInSeconds: seconds,
        });
      }
    }
  };

  const handleWordLevelContentChange = (newValue) => {
    setIsContentIsModified(true);
    setIsContentSaved(false);
    // a versioned profile (rigid/whisperx) records each word-level edit as a snapshot.
    // Once Freestyle has inserted/deleted words (a paragraph carries an anchorless
    // word), the strict word-count invariant no longer holds, so route through the
    // freetext snapshot instead — keeping both modes on one shared overlay/history.
    if (profile.versioning) {
      const hasInserted =
        typeof profile.versioning.snapshotFreeText === 'function' &&
        (newValue || []).some((p) =>
          (p.children && p.children[0] && p.children[0].words ? p.children[0].words : []).some(
            (w) => w._key == null && typeof w.text === 'string' && w.text.length > 0
          )
        );
      if (hasInserted) profile.versioning.snapshotFreeText(newValue);
      else profile.versioning.snapshot(newValue);
    }
    // forward word-level edits to the host (same prop classic free-text uses),
    // so a host can observe mutes/rewrites — e.g. for a faithful rev.ai round-trip
    if (props.handleAutoSaveChanges) {
      props.handleAutoSaveChanges(newValue);
    }
    // keep the derived sentence-level shadow in sync (debounced, rigid only)
    if (emitSentenceModel) {
      emitSentenceModel();
    }
  };

  // ── Freestyle commit cycle ──────────────────────────────────────────────────
  // Debounced (fires after typing settles). For each anchored paragraph whose text
  // changed, diff-align it against its original model words and write the aligned
  // tokens onto the leaf's `words[]` IN PLACE (the text node is untouched, so the
  // caret survives), then snapshot the freetext overlay + autosave. A full remount
  // (replaceSlateValue) is reserved for undo/redo/revert/mode-switch.
  const lastAlignedRef = useRef(new Map()); // anchorKey -> last leaf.text we aligned
  const commitFreestyleEdit = useMemo(
    () =>
      debounce(() => {
        if (!(profile.versioning && typeof profile.versioning.snapshotFreeText === 'function')) return;
        const children = editor.children || [];
        children.forEach((para, pIdx) => {
          if (!para || para.type !== 'timedText' || !para.anchorKey) return;
          const leaf = para.children && para.children[0];
          if (!leaf || typeof leaf.text !== 'string') return;
          if (lastAlignedRef.current.get(para.anchorKey) === leaf.text) return; // unchanged since last align
          const originalWords = profile.originalWordsBetween
            ? profile.originalWordsBetween(para.anchorKey, para.span && para.span.lastWordKey)
            : null;
          if (!originalWords) return;
          const aligned = alignParagraph(originalWords, leaf.text);
          const newWords = aligned.map((t) => tokenToLeafWord(t, para.speaker));
          lastAlignedRef.current.set(para.anchorKey, leaf.text);
          if (!freestyleWordsEqual(leaf.words, newWords)) {
            Transforms.setNodes(editor, { words: newWords }, { at: [pIdx, 0] });
          }
        });
        const committed = profile.versioning.snapshotFreeText(editor.children);
        if (committed) {
          if (props.handleAutoSaveChanges) props.handleAutoSaveChanges(editor.children);
          if (emitSentenceModel) emitSentenceModel();
        }
      }, 300),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, profile, emitSentenceModel]
  );
  useEffect(() => () => commitFreestyleEdit && commitFreestyleEdit.cancel(), [commitFreestyleEdit]);

  // Switching Word ↔ Freestyle re-projects from the shared overlay so both surfaces
  // show the same committed state (flush any pending freestyle commit first).
  const prevEditingModeRef = useRef(editingMode);
  useEffect(() => {
    if (prevEditingModeRef.current === editingMode) return;
    prevEditingModeRef.current = editingMode;
    if (commitFreestyleEdit) commitFreestyleEdit.flush();
    lastAlignedRef.current = new Map();
    if (profile.versioning && profile.reproject) {
      replaceSlateValue(profile.reproject());
      refreshStyles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMode]);

  // word-level "follow the speech" highlight (karaoke)
  const wordMap = useMemo(() => buildWordMap(value), [value]);
  const activeWordIndex = useMemo(() => (followPlayback ? findActiveWord(wordMap, currentTime) : -1), [followPlayback, wordMap, currentTime]);

  // Confidence "heat" overlay decorations — derived from value + confidence settings
  // only (never caret/time), so they don't recompute on playback ticks.
  const confidenceSettings = useMemo(
    () => ({ ...settings.confidence, highlightOpacity: settings.appearance.highlightOpacity }),
    [settings.confidence, settings.appearance.highlightOpacity]
  );
  const confidenceDecos = useMemo(() => buildConfidenceDecorations(value, confidenceSettings), [value, confidenceSettings]);
  // Estimated-timing (inserted) words in Freestyle mode — value-only (no playback recompute).
  // Estimated-timing (inserted) words underline in BOTH modes — a paragraph edited in
  // Loose can carry estimated words that are still visible in Strict, so the display is
  // identical regardless of the active mode.
  const provenanceDecos = useMemo(() => buildProvenanceDecorations(value), [value]);

  // (D) user styling — bold/italic/underline/highlight/note, anchored to word ids and
  // rendered as decorations (never marks), so it can't corrupt word/timing data and
  // composes with confidence/karaoke/provenance on the same leaf. `showStyling` only
  // hides the rendering; the data (overlay.styles) is retained.
  const showStyling = settings.display.showStyling !== false;
  const [styleRanges, setStyleRanges] = useState([]);
  const styleDecos = useMemo(
    () => (showStyling ? buildStyleDecorations(value, styleRanges) : { enabled: false, byPara: [] }),
    [showStyling, value, styleRanges]
  );
  const refreshStyles = () => setStyleRanges(profile.versioning && profile.versioning.getStyles ? profile.versioning.getStyles() : []);

  const decorate = useCallback(
    ([node, path]) => {
      if (!Text.isText(node) || path.length !== 2 || path[1] !== 0) return [];
      const pIdx = path[0];
      const ranges = [];
      // (A) confidence heat — independent of playback, keyed on value + settings
      if (confidenceDecos.enabled) {
        const paraDecos = confidenceDecos.byPara[pIdx];
        if (paraDecos) {
          paraDecos.forEach((d) => {
            ranges.push({
              anchor: { path, offset: d.charStart },
              focus: { path, offset: d.charEnd },
              confidenceStyle: d.confidenceStyle,
              confidenceBand: d.confidenceBand,
            });
          });
        }
      }
      // (B) karaoke active word — may overlap a confidence range
      if (followPlayback && activeWordIndex >= 0) {
        const activeWord = wordMap[activeWordIndex];
        if (activeWord && pIdx === activeWord.pIdx) {
          ranges.push({
            anchor: { path, offset: activeWord.charStart },
            focus: { path, offset: activeWord.charEnd },
            currentWord: true,
          });
        }
      }
      // (C) provenance — estimated-timing (inserted) words get a dotted underline
      if (provenanceDecos.enabled) {
        const paraDecos = provenanceDecos.byPara[pIdx];
        if (paraDecos) {
          paraDecos.forEach((d) => {
            ranges.push({ anchor: { path, offset: d.charStart }, focus: { path, offset: d.charEnd }, provenance: d.provenance });
          });
        }
      }
      // (D) user styling — bold / italic / underline / highlight / note
      if (styleDecos.enabled) {
        const paraDecos = styleDecos.byPara[pIdx];
        if (paraDecos) {
          paraDecos.forEach((d) => {
            const range = { anchor: { path, offset: d.charStart }, focus: { path, offset: d.charEnd } };
            const m = d.mark;
            if (m === 'bold') range.styleBold = true;
            else if (m === 'italic') range.styleItalic = true;
            else if (m === 'underline') range.styleUnderline = true;
            else if (m && m.highlight) range.styleHighlight = m.highlight;
            else if (m && typeof m.note === 'string') {
              range.styleNote = m.note;
              range.styleUnderline = true;
            }
            ranges.push(range);
          });
        }
      }
      return ranges;
    },
    [followPlayback, activeWordIndex, wordMap, confidenceDecos, provenanceDecos, styleDecos]
  );

  // keep the spoken word in view; keyed on word index so it only fires on change
  useEffect(() => {
    if (!followPlayback || activeWordIndex < 0) return;
    if (typeof document === 'undefined') return;
    const el = document.querySelector('.editor-wrapper-container .current-word');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [followPlayback, activeWordIndex]);

  const renderElement = useCallback(
    (props) => {
      switch (props.element.type) {
        case 'timedText':
          return <TimedTextElement {...props} />;
        default:
          return <DefaultElement {...props} />;
      }
    },
    // showSpeakers/showTimecodes/showAnnotations are closed over by TimedTextElement;
    // without them here Slate keeps the stale closure and the editor ignores the toggles.
    // isFreestyle/editable drive the per-sentence gutter rendered inside the element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showSpeakers, showTimecodes, showAnnotations, isFreestyle, editable, value]
  );

  // NOTE: activeWordIndex is intentionally in the dependency list even though it
  // is not referenced here. slate-react 0.59 memoizes leaves and only re-renders
  // them when `renderLeaf` identity (or a leaf's own decorations) changes. By
  // giving renderLeaf a fresh identity whenever the active word changes, the
  // leaves re-render and pick up the `currentWord` decoration produced above.
  const renderLeaf = useCallback(
    ({ attributes, children, leaf }) => {
      let className = leaf.currentWord ? 'timecode text current-word' : 'timecode text';
      if (leaf.provenance === 'estimated') className += ' stw-prov-estimated';
      if (leaf.styleNote) className += ' stw-note';
      // active (karaoke) word keeps its yellow bg; otherwise paint the confidence wash
      const style = !leaf.currentWord && leaf.confidenceStyle ? { backgroundColor: leaf.confidenceStyle, borderRadius: '2px' } : {};
      // (D) user styling marks — composed additively; a user highlight overrides the wash
      if (leaf.styleBold) style.fontWeight = 700;
      if (leaf.styleItalic) style.fontStyle = 'italic';
      if (leaf.styleUnderline) style.textDecoration = style.textDecoration ? `${style.textDecoration} underline` : 'underline';
      if (leaf.styleHighlight) {
        style.backgroundColor = leaf.styleHighlight;
        style.borderRadius = '2px';
      }
      const hasStyle = Object.keys(style).length > 0;
      const title = leaf.styleNote || (leaf.provenance === 'estimated' ? 'Estimated timing — not from the original audio' : undefined);
      return (
        <span
          onDoubleClick={handleLeafDoubleClick}
          onClick={handleLeafAltClick}
          className={className}
          style={hasStyle ? style : undefined}
          title={title}
          data-start={children.props.parent.start}
          data-previous-timings={children.props.parent.previousTimings}
          data-confidence-band={leaf.confidenceBand || undefined}
          {...attributes}
        >
          {children}
        </span>
      );
    },
    // wordLevelEditing/value keep the double-click + mute closures fresh across mode
    // switches and edits (renderLeaf is memoized; without them it captures stale state).
    // styleDecos gives renderLeaf a fresh identity when styling changes so leaves repaint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWordIndex, confidenceDecos, provenanceDecos, styleDecos, wordLevelEditing, editable, value]
  );

  //

  /**
   * `handleSetSpeakerName` is outside of TimedTextElement
   * to improve the overall performance of the editor,
   * especially on long transcripts
   * @param {*} element - props.element, from `renderElement` function
   */
  const handleSetSpeakerName = (element) => {
    if (editable) {
      const pathToCurrentNode = ReactEditor.findPath(editor, element);
      const oldSpeakerName = element.speaker;
      const newSpeakerName = prompt('Change speaker name', oldSpeakerName);
      if (newSpeakerName) {
        const isUpdateAllSpeakerInstances = confirm(`Would you like to replace all occurrences of ${oldSpeakerName} with ${newSpeakerName}?`);
        if (props.handleAnalyticsEvents) {
          // handles if set speaker name, and whether updates one or multiple
          props.handleAnalyticsEvents('ste_set_speaker_name', {
            fn: 'handleSetSpeakerName',
            changeSpeaker: true,
            updateMultiple: isUpdateAllSpeakerInstances,
          });
        }
        if (isUpdateAllSpeakerInstances) {
          const rangeForTheWholeEditor = Editor.range(editor, []);
          // Apply transformation to the whole doc, where speaker matches old spekaer name, and set it to new one
          Transforms.setNodes(
            editor,
            { type: 'timedText', speaker: newSpeakerName },
            {
              at: rangeForTheWholeEditor,
              match: (node) => node.type === 'timedText' && node.speaker.toLowerCase() === oldSpeakerName.toLowerCase(),
            }
          );
        } else {
          // only apply speaker name transformation to current element
          Transforms.setNodes(editor, { type: 'timedText', speaker: newSpeakerName }, { at: pathToCurrentNode });
        }
      } else {
        if (props.handleAnalyticsEvents) {
          // handles if click cancel and doesn't set speaker name
          props.handleAnalyticsEvents('ste_set_speaker_name', {
            fn: 'handleSetSpeakerName',
            changeSpeaker: false,
            updateMultiple: false,
          });
        }
      }
    }
  };

  // Freestyle per-sentence revert: restore one sentence's words to the original
  // model words, then re-commit. `firstKey`/`lastKey` bound the sentence's model span.
  const handleRevertSentence = (paragraphAnchorKey, wIdxStart, wIdxEnd, firstKey, lastKey) => {
    if (!isFreestyle || !profile.originalWordsBetween) return;
    const pIdx = editor.children.findIndex((p) => p && p.anchorKey === paragraphAnchorKey);
    if (pIdx < 0) return;
    const para = editor.children[pIdx];
    const leaf = para.children && para.children[0];
    const words = (leaf && leaf.words) || [];
    if (firstKey == null) return; // a sentence with no surviving anchor can't be reverted to original
    const originals = profile.originalWordsBetween(firstKey, lastKey);
    const restored = originals.map((o) =>
      tokenToLeafWord({ ref: o.key, value: o.value, start: o.start, end: o.end, confidence: o.confidence, estimated: false }, para.speaker)
    );
    const newWords = [...words.slice(0, wIdxStart), ...restored, ...words.slice(wIdxEnd + 1)];
    const newText = newWords.map((w) => w.text).join(' ');
    const leafPath = [pIdx, 0];
    const oldText = (leaf && leaf.text) || '';
    Transforms.delete(editor, { at: { anchor: { path: leafPath, offset: 0 }, focus: { path: leafPath, offset: oldText.length } } });
    Transforms.insertText(editor, newText, { at: { path: leafPath, offset: 0 } });
    Transforms.setNodes(editor, { words: newWords }, { at: leafPath });
    lastAlignedRef.current.set(paragraphAnchorKey, newText);
    setValue(editor.children);
    const committed = profile.versioning.snapshotFreeText(editor.children);
    if (committed) {
      if (props.handleAutoSaveChanges) props.handleAutoSaveChanges(editor.children);
      if (emitSentenceModel) emitSentenceModel();
    }
    setIsContentIsModified(true);
    setIsContentSaved(false);
  };

  const sentenceMetricIdx = settings.confidence.sentenceMetric === 'duration_weighted' ? 1 : 0;
  const confStyleOpts = {
    cutoff: settings.confidence.cutoff,
    floor: settings.confidence.floor,
    highlightOpacity: settings.appearance.highlightOpacity,
  };

  // contentEditable=false gutter rendered under a Freestyle paragraph: one chip per
  // sentence (confidence badge, estimated-timing dot, revert-sentence button).
  const SentenceGutter = ({ element }) => {
    const words = (element.children && element.children[0] && element.children[0].words) || [];
    if (!words.length) return null;
    const sentences = groupSlateWordsIntoSentences(words);
    return (
      <div contentEditable={false} className="unselectable" style={{ marginTop: 2, marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {sentences.map(({ wIdxStart, wIdxEnd, words: sWords }, si) => {
          const conf = confidenceOf(sWords)[sentenceMetricIdx];
          const lowStyle = confidenceToStyle(conf, confStyleOpts);
          const badgeColor = lowStyle || '#d1fae5';
          const hasEstimated = sWords.some((w) => w._key == null || (typeof w.timingSource === 'string' && w.timingSource !== 'original'));
          const survivors = sWords.filter((w) => w._key != null);
          const firstKey = survivors.length ? survivors[0]._key : null;
          const lastKey = survivors.length ? survivors[survivors.length - 1]._key : null;
          return (
            <span key={si} className="stw-sentence-gutter">
              <span
                className="stw-conf-badge"
                style={{ background: badgeColor }}
                title={typeof conf === 'number' ? `Sentence confidence ${conf.toFixed(2)}` : 'Sentence confidence n/a'}
                aria-label={typeof conf === 'number' ? `confidence ${conf.toFixed(2)}` : 'confidence not available'}
              />
              {hasEstimated && (
                <span className="stw-est-dot" title="Contains estimated (interpolated) timing">
                  ●
                </span>
              )}
              {editable && firstKey != null && (
                <button
                  type="button"
                  className="stw-revert-sentence"
                  title="Revert this sentence to the original words"
                  aria-label="Revert this sentence"
                  onClick={() => handleRevertSentence(element.anchorKey, wIdxStart, wIdxEnd, firstKey, lastKey)}
                >
                  ↩
                </button>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const TimedTextElement = (props) => {
    // Reflow: text fills whatever width the hidden speaker/timecode columns free up.
    const textLg = 12 - (showTimecodes ? 2 : 0) - (showSpeakers ? 3 : 0);
    const textXl = textLg;

    return (
      <Grid container direction="row" sx={{ justifyContent: 'flex-start', alignItems: 'baseline' }} {...props.attributes}>
        {showTimecodes && (
          <Grid contentEditable={false} size={{ xs: 4, sm: 3, md: 3, lg: 2, xl: 2 }} className={'text-truncate'}>
            <code
              contentEditable={false}
              style={{ cursor: 'pointer', fontSize: 'inherit', color: '#9e9e9e' }}
              className={'timecode unselectable'}
              onClick={handleTimedTextClick}
              onDoubleClick={handleTimedTextClick}
              title={props.element.startTimecode}
              data-start={props.element.start}
            >
              {props.element.startTimecode}
            </code>
          </Grid>
        )}
        {showSpeakers && (
          <Grid contentEditable={false} size={{ xs: 8, sm: 9, md: 9, lg: 3, xl: 3 }} className={'text-truncate'}>
            <Typography
              noWrap
              contentEditable={false}
              className={'text-truncate unselectable'}
              style={{
                cursor: 'pointer',
                width: '100%',
                fontSize: 'inherit',
                color: '#9e9e9e',
              }}
              title={props.element.speaker}
              onClick={handleSetSpeakerName.bind(this, props.element)}
            >
              {props.element.speaker}
            </Typography>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 12, md: 12, lg: textLg, xl: textXl }} className={'p-b-1 mx-auto'}>
          {props.children}
          {isFreestyle && <SentenceGutter element={props.element} />}
          {showAnnotations && props.element.annotations && <AnnotationChips annotations={props.element.annotations} />}
        </Grid>
      </Grid>
    );
  };

  const DefaultElement = (props) => {
    return <p {...props.attributes}>{props.children}</p>;
  };

  const handleTimedTextClick = (e) => {
    if (e.target.classList.contains('timecode')) {
      const start = e.target.dataset.start;
      if (mediaRef && mediaRef.current) {
        mediaRef.current.currentTime = parseFloat(start);
        mediaRef.current.play();

        if (props.handleAnalyticsEvents) {
          // handles if click cancel and doesn't set speaker name
          props.handleAnalyticsEvents('ste_handle_timed_text_click', {
            fn: 'handleTimedTextClick',
            clickOrigin: 'timecode',
            timeInSeconds: mediaRef.current.currentTime,
          });
        }
      }
    } else if (e.target.dataset.slateString) {
      if (e.target.parentNode.dataset.start) {
        const { startWord } = SlateHelpers.getSelectionNodes(editor, editor.selection);
        if (mediaRef && mediaRef.current && startWord && startWord.start) {
          mediaRef.current.currentTime = parseFloat(startWord.start);
          mediaRef.current.play();

          if (props.handleAnalyticsEvents) {
            // handles if click cancel and doesn't set speaker name
            props.handleAnalyticsEvents('ste_handle_timed_text_click', {
              fn: 'handleTimedTextClick',
              clickOrigin: 'word',
              timeInSeconds: mediaRef.current.currentTime,
            });
          }
        } else {
          // fallback in case there's some misalignment with the words
          // use the start of paragraph instead
          const start = parseFloat(e.target.parentNode.dataset.start);
          if (mediaRef && mediaRef.current && start) {
            mediaRef.current.currentTime = parseFloat(start);
            mediaRef.current.play();

            if (props.handleAnalyticsEvents) {
              // handles if click cancel and doesn't set speaker name
              props.handleAnalyticsEvents('ste_handle_timed_text_click', {
                fn: 'handleTimedTextClick',
                origin: 'paragraph-fallback',
                timeInSeconds: mediaRef.current.currentTime,
              });
            }
          }
        }
      }
    }
  };

  // ── Strict (word) mode interaction ──────────────────────────────────────────
  // Strict renders the SAME Slate <Editable> as Loose, but READ-ONLY: edits never
  // flow through Slate typing. The only mode-specific gesture is double-click, which
  // selects one word and opens a small popover for a single-word rewrite/mute; the
  // commit goes through the count-preserving snapshot path. Ctrl/Cmd-click mutes.
  const [strictEdit, setStrictEdit] = useState(null); // { pIdx, wIdx, draft, muted, wordKey, start, x, y } | null
  const [selectedWordKey, setSelectedWordKey] = useState(null); // the Strict double-click target for styling
  const styleIdRef = useRef(0);

  // Resolve the word under a pointer event, decoration-safe (findEventRange maps DOM
  // coordinates to a logical Slate point regardless of how decorations split the leaf).
  const resolveWordFromEvent = (e) => {
    let anchor = null;
    try {
      const range = ReactEditor.findEventRange(editor, e);
      if (range && range.anchor) anchor = range.anchor;
    } catch (err) {
      anchor = editor.selection ? editor.selection.anchor : null;
    }
    if (!anchor || !Array.isArray(anchor.path)) return null;
    const pIdx = anchor.path[0];
    const para = value[pIdx];
    const words = para && para.children && para.children[0] && Array.isArray(para.children[0].words) ? para.children[0].words : [];
    if (!words.length) return null;
    let acc = 0;
    for (let i = 0; i < words.length; i += 1) {
      const len = (typeof words[i].text === 'string' ? words[i].text : '').length;
      if (anchor.offset <= acc + len) return { pIdx, wIdx: i, word: words[i] };
      acc += len + 1; // + the joining space (leaf text = words.map(t).join(' '))
    }
    const last = words.length - 1;
    return { pIdx, wIdx: last, word: words[last] };
  };

  // Rebuild the value with ONE word changed; leaf text uses the bare-word join (the
  // offset convention). Count is preserved (rewrite/mute only) so the commit routes
  // through the count-validated snapshot (handleWordLevelContentChange).
  const commitStrictWord = (pIdx, wIdx, changes) => {
    const newValue = value.map((para, pi) => {
      if (pi !== pIdx) return para;
      const child = para.children[0];
      const words = child.words.map((w, wi) => (wi === wIdx ? { ...w, ...changes } : w));
      const text = words.map((w) => (typeof w.text === 'string' ? w.text : '')).join(' ');
      return { ...para, children: [{ ...child, words, text }] };
    });
    replaceSlateValue(newValue);
    handleWordLevelContentChange(newValue);
  };

  const handleLeafDoubleClick = (e) => {
    if (!wordLevelEditing) return; // LOOSE: let the browser do native word selection
    if (editable === false) return;
    e.preventDefault();
    const resolved = resolveWordFromEvent(e);
    if (!resolved) return;
    const w = resolved.word;
    setSelectedWordKey(w._key);
    setStrictEdit({
      pIdx: resolved.pIdx,
      wIdx: resolved.wIdx,
      draft: typeof w.text === 'string' ? w.text : '',
      muted: w.muted === true,
      wordKey: w._key,
      start: w.start,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Ctrl/Cmd-click in Strict toggles mute on the clicked word. Returns true if it handled the event.
  const handleLeafMute = (e) => {
    if (!wordLevelEditing || editable === false) return false;
    if (!(e.ctrlKey || e.metaKey)) return false;
    const resolved = resolveWordFromEvent(e);
    if (!resolved) return false;
    e.preventDefault();
    commitStrictWord(resolved.pIdx, resolved.wIdx, { muted: !resolved.word.muted });
    return true;
  };

  const saveStrictEdit = () => {
    if (!strictEdit) return;
    const para = value[strictEdit.pIdx];
    const cur = para && para.children && para.children[0] && para.children[0].words ? para.children[0].words[strictEdit.wIdx] : null;
    if (cur && cur.text === strictEdit.draft) {
      setStrictEdit(null); // unchanged (e.g. blur without editing) — just close, no commit/remount
      return;
    }
    commitStrictWord(strictEdit.pIdx, strictEdit.wIdx, { text: strictEdit.draft });
    setStrictEdit(null);
  };

  // ── User styling — bold / italic / underline / highlight / note ───────────────
  // One action for both modes; the only difference is the selection source. Applying a
  // mark adds a word-anchored style range to overlay.styles (a decoration — never a
  // tree edit), so it is safe even on the read-only Strict surface.
  const sameMark = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const applyStyleRanges = (newRanges, mark) => {
    if (!profile.versioning || !profile.versioning.setStyles) return;
    const next = styleRanges.slice();
    newRanges.forEach((r) => {
      // toggle: an identical span+mark removes it; otherwise add
      const idx = next.findIndex(
        (s) => s.fromKey === r.fromKey && s.toKey === r.toKey && s.fromOffset === r.fromOffset && s.toOffset === r.toOffset && sameMark(s.mark, mark)
      );
      if (idx >= 0) next.splice(idx, 1);
      else next.push({ id: `sty-${(styleIdRef.current += 1)}`, ...r, mark });
    });
    setStyleRanges(next);
    profile.versioning.setStyles(next);
    setIsContentIsModified(true);
    setIsContentSaved(false);
    if (props.handleAutoSaveChanges) props.handleAutoSaveChanges(editor.children);
  };

  const applyStyleToSelection = (mark) => {
    if (!profile.versioning || !profile.versioning.setStyles) return;
    if (wordLevelEditing) {
      // STRICT: style the double-click-selected word (whole word)
      if (!selectedWordKey) return;
      let word = null;
      value.forEach((p) =>
        ((p.children && p.children[0] && p.children[0].words) || []).forEach((w) => {
          if (w._key === selectedWordKey) word = w;
        })
      );
      if (!word) return;
      applyStyleRanges([{ fromKey: selectedWordKey, fromOffset: 0, toKey: selectedWordKey, toOffset: (word.text || '').length }], mark);
    } else {
      // LOOSE: style the native selection (split per paragraph)
      const sel = editor.selection;
      if (!sel || Range.isCollapsed(sel)) return;
      if (commitFreestyleEdit) commitFreestyleEdit.flush();
      const ranges = selectionToStyleRanges(editor.children, sel);
      if (ranges.length) applyStyleRanges(ranges, mark);
    }
  };

  // LOOSE-mode word gesture: a plain click places the text cursor (so you can type),
  // Alt/Option-click seeks to the word + toggles play/pause. In Strict, Ctrl/Cmd-click
  // mutes the clicked word (handled first).
  const handleLeafAltClick = (e) => {
    if (handleLeafMute(e)) return;
    if (!e.altKey) return; // plain single click: let Slate place the caret
    const { startWord } = SlateHelpers.getSelectionNodes(editor, editor.selection);
    let start = startWord && typeof startWord.start === 'number' ? startWord.start : null;
    if (start == null && e.target.parentNode && e.target.parentNode.dataset && e.target.parentNode.dataset.start) {
      start = parseFloat(e.target.parentNode.dataset.start);
    }
    if (typeof start === 'number' && !Number.isNaN(start)) seekAndTogglePlayWord(start);
  };

  const handleReplaceText = () => {
    if (editPolicy.allowsStructuralEdits === false) return;
    const newText = prompt(`Paste the text to replace here.\n\n${REPLACE_WHOLE_TEXT_INSTRUCTION}`);
    if (newText) {
      const newValue = plainTextalignToSlateJs(props.transcriptData, newText, value);
      replaceSlateValue(newValue);

      // TODO: consider adding some kind of word count here?
      if (props.handleAnalyticsEvents) {
        // handles if click cancel and doesn't set speaker name
        props.handleAnalyticsEvents('ste_handle_replace_text', {
          fn: 'handleReplaceText',
        });
      }
    }
  };

  // TODO: refacto this function, to be cleaner and easier to follow.
  const handleRestoreTimecodes = async (inlineTimecodes = false) => {
    // if nothing as changed and you don't need to modify the data
    // to get inline timecodes, then just return as is
    if (!isContentModified && !inlineTimecodes) {
      return value;
    }
    // only used by Word (OHMS) export
    const alignedSlateData = await updateBloocksTimestamps(value, inlineTimecodes);
    replaceSlateValue(alignedSlateData);
    setIsContentIsModified(false);

    if (inlineTimecodes) {
      // we don't want to show the inline timecode in the editor, but we want to return them to export function
      const alignedSlateDataWithInlineTimecodes = insertTimecodesInLineInSlateJs(alignedSlateData);
      return alignedSlateDataWithInlineTimecodes;
    }

    return alignedSlateData;
  };

  // TODO: this could be refactore, and brought some of this logic inside the exportAdapter (?)
  // To make this a little cleaner
  const handleExport = async ({ type, ext, speakers, timecodes, inlineTimecodes, hideTitle, atlasFormat, isDownload }) => {
    if (props.handleAnalyticsEvents) {
      // handles if click cancel and doesn't set speaker name
      props.handleAnalyticsEvents('ste_handle_export', {
        fn: 'handleExport',
        type,
        ext,
        speakers,
        timecodes,
        inlineTimecodes,
        hideTitle,
        atlasFormat,
        isDownload,
      });
    }

    // profile-provided exporters (e.g. rigid "rev.ai (faithful)") bypass the classic
    // slate->DPE pipeline + muted-strip below, which assume the DPE slate shape.
    const profileExporter = (profile.exporters || []).find((e) => e.id === type);
    if (profileExporter) {
      let out = profileExporter.run(getSlateContent());
      // stringify any object result (covers ext 'json' and 'sentences.json');
      // a pre-formatted string exporter passes through untouched.
      if (out && typeof out === 'object') out = JSON.stringify(out, null, 2);
      if (isDownload) download(out, `${getFileTitle()}.${ext}`);
      return out;
    }

    try {
      setIsProcessing(true);
      let tmpValue = getSlateContent();
      if (timecodes) {
        tmpValue = await handleRestoreTimecodes();
      }

      if (inlineTimecodes) {
        tmpValue = await handleRestoreTimecodes(inlineTimecodes);
      }

      if (isContentModified && type === 'json-slate') {
        tmpValue = await handleRestoreTimecodes();
      }

      if (isContentModified && isCaptionType(type)) {
        tmpValue = await handleRestoreTimecodes();
      }
      // muted words are kept (with `muted: true`) in the saved DPE/slate JSON,
      // but removed from human-facing exports (text, word, subtitles)
      const shouldStripMuted = type === 'text' || type === 'word' || isCaptionType(type);
      const exportSlateValue = shouldStripMuted ? stripMutedWords(tmpValue) : tmpValue;
      // export adapter does not doo any alignment
      // just converts between formats
      let editorContnet = exportAdapter({
        slateValue: exportSlateValue,
        type,
        transcriptTitle: getFileTitle(),
        speakers,
        timecodes,
        inlineTimecodes,
        hideTitle,
        atlasFormat,
      });

      if (ext === 'json') {
        editorContnet = JSON.stringify(editorContnet, null, 2);
      }
      if (ext !== 'docx' && isDownload) {
        download(editorContnet, `${getFileTitle()}.${ext}`);
      }
      return editorContnet;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      // Save the faithful transcript JSON. Clamp the requested content type to one the
      // active profile actually exports (rev.ai -> json-rev, WhisperX -> json-whisperx),
      // defaulting to the profile's primary faithful exporter — no DPE save path remains.
      const supported = (profile.exporters || []).map((e) => e.id);
      const requested = settings.editing.autoSaveContentType ? `json-${settings.editing.autoSaveContentType}` : null;
      const type = requested && supported.includes(requested) ? requested : supported[0] || 'json-slate';
      const format = type.replace(/^json-/, '');
      const editorContnet = await handleExport({ type, isDownload: false });
      if (props.handleAnalyticsEvents) {
        // handles if click cancel and doesn't set speaker name
        props.handleAnalyticsEvents('ste_handle_save', {
          fn: 'handleSave',
          format,
        });
      }

      if (props.handleSaveEditor && editable) {
        props.handleSaveEditor(editorContnet);
      }
      // Snapshot `value` (the React state), not `editor.children`: in word-level mode
      // edits go through setValue and never touch the Slate tree, so editor.children
      // would be the stale initial import. `value` is current in both edit paths.
      lastSavedValueRef.current = cloneValue(value);
      setIsContentIsModified(false);
      setIsContentSaved(true);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * See explanation in `src/utils/dpe-to-slate/index.js` for how this function works with css injection
   * to provide current paragaph's highlight.
   * @param {Number} currentTime - float in seconds
   */

  const handleSetPauseWhileTyping = () => {
    if (props.handleAnalyticsEvents) {
      // handles if click cancel and doesn't set speaker name
      props.handleAnalyticsEvents('ste_handle_set_pause_while_typing', {
        fn: 'handleSetPauseWhileTyping',
        isPauseWhiletyping: !isPauseWhiletyping,
      });
    }
    setIsPauseWhiletyping(!isPauseWhiletyping);
  };

  const handleSplitParagraph = () => {
    if (editPolicy.allowsStructuralEdits === false) return;
    SlateHelpers.handleSplitParagraph(editor);
  };

  const handleUndo = () => {
    if (profile.versioning) {
      // flush any pending Loose edit first so the latest typing burst is in history
      if (commitFreestyleEdit) commitFreestyleEdit.flush();
      profile.versioning.undo();
      replaceSlateValue(profile.reproject());
      refreshStyles();
      return;
    }
    editor.undo();
  };

  const handleRedo = () => {
    if (profile.versioning) {
      if (commitFreestyleEdit) commitFreestyleEdit.flush();
      profile.versioning.redo();
      replaceSlateValue(profile.reproject());
      refreshStyles();
      return;
    }
    editor.redo();
  };

  // ⌘Z / ⌘Y (Ctrl on Windows) undo/redo for the overlay-history tiers (Rigid + Loose),
  // bound at the document level so it also fires while the media element is focused
  // during playback. Form fields (e.g. the inline word-edit input) keep their own undo;
  // classic free-text uses Slate's native history. Capture phase beats Slate withHistory.
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;
  const applyStyleRef = useRef(applyStyleToSelection);
  applyStyleRef.current = applyStyleToSelection;
  useEffect(() => {
    if (!profile.versioning) return undefined;
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || !editable) return;
      const ae = document.activeElement;
      const tag = ae && ae.tagName ? ae.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return; // let form fields keep their own undo
      const k = (e.key || '').toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      // ⌘B / ⌘I / ⌘U apply user styling to the current selection (both modes)
      const styleMark = k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : null;
      if (!isUndo && !isRedo && !styleMark) return;
      // stop here so Slate's own ⌘Z history / ⌘B bold (Loose mode's <Editable>) doesn't
      // ALSO fire — we own undo/redo + styling via the overlay.
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (isUndo) handleUndoRef.current();
      else if (isRedo) handleRedoRef.current();
      else applyStyleRef.current(styleMark);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [profile, editable]);

  // const debounced_version = throttle(handleRestoreTimecodes, 3000, { leading: false, trailing: true });
  // TODO: revisit logic for
  // - splitting paragraph via enter key
  // - merging paragraph via delete
  // - merging paragraphs via deleting across paragraphs
  const handleOnKeyDown = async (event) => {
    setIsContentIsModified(true);
    setIsContentSaved(false);
    // profiles that forbid structural edits (rigid/whisperx) block paragraph split/merge
    if (editPolicy.allowsStructuralEdits === false) {
      if (isFreestyle) {
        // Freestyle: allow free in-paragraph typing/insert/delete; block only the
        // CROSS-paragraph structural keys (Enter splits; Backspace/Delete at a
        // paragraph edge would merge speaker turns). Everything else falls through
        // to Slate; the debounced onChange commit re-aligns the edited paragraph.
        if (event.key === 'Enter') {
          event.preventDefault();
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          const sel = editor.selection;
          if (sel && Range.isCollapsed(sel)) {
            const paraPath = [sel.anchor.path[0]];
            const atEdge = event.key === 'Backspace' ? Editor.isStart(editor, sel.anchor, paraPath) : Editor.isEnd(editor, sel.anchor, paraPath);
            if (atEdge) {
              event.preventDefault();
              return;
            }
          }
        }
        return; // let Slate handle the keystroke natively
      }
      if (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
      }
      return;
    }
    //  ArrowRight ArrowLeft ArrowUp ArrowUp
    if (event.key === 'Enter') {
      // intercept Enter, and handle timecodes when splitting a paragraph
      event.preventDefault();
      // console.info('For now disabling enter key to split a paragraph, while figuring out the aligment issue');
      // handleSetPauseWhileTyping();
      // TODO: Edge case, hit enters after having typed some other words?
      const isSuccess = SlateHelpers.handleSplitParagraph(editor);
      if (props.handleAnalyticsEvents) {
        // handles if click cancel and doesn't set speaker name
        props.handleAnalyticsEvents('ste_handle_split_paragraph', {
          fn: 'handleSplitParagraph',
          isSuccess,
        });
      }
      if (isSuccess) {
        // as part of splitting paragraphs there's an alignement step
        // so content is not counted as modified
        setIsContentIsModified(false);
      }
    }
    if (event.key === 'Backspace') {
      const isSuccess = SlateHelpers.handleDeleteInParagraph({ editor, event });
      // Commenting that out for now, as it might get called too often
      // if (props.handleAnalyticsEvents) {
      //   // handles if click cancel and doesn't set speaker name
      //   props.handleAnalyticsEvents('ste_handle_delete_paragraph', {
      //     fn: 'handleDeleteInParagraph',
      //     isSuccess,
      //   });
      // }
      if (isSuccess) {
        // as part of splitting paragraphs there's an alignement step
        // so content is not counted as modified
        setIsContentIsModified(false);
      }
    }
    // if (event.key.length == 1 && ((event.keyCode >= 65 && event.keyCode <= 90) || (event.keyCode >= 49 && event.keyCode <= 57))) {
    //   const alignedSlateData = await debouncedSave(value);
    //   setValue(alignedSlateData);
    //   setIsContentIsModified(false);
    // }

    if (isPauseWhiletyping) {
      // logic for pause while typing
      // https://schier.co/blog/wait-for-user-to-stop-typing-using-javascript
      // TODO: currently eve the video was paused, and pause while typing is on,
      // it will play it when stopped typing. so added btn to turn feature on off.
      // and disabled as default.
      // also pause while typing might introduce performance issues on longer transcripts
      // if on every keystroke it's creating and destroing a timer.
      // should find a more efficient way to "debounce" or "throttle" this functionality
      if (mediaRef && mediaRef.current && !mediaRef.current.paused) {
        mediaRef.current.pause();
        debouncePauseWhileTyping(mediaRef.current);
      }
    }
    // auto align when not typing
  };
  return (
    <div style={{ paddingTop: '1em' }}>
      <CssBaseline />
      <Container>
        <Paper elevation={3} />
        <style scoped>
          {`/* Next words */
             .timecode[data-previous-timings*="${generatePreviousTimingsUpToCurrent(currentTime)}"]{
                  color:  #9E9E9E;
              }

              /* word currently being spoken ("follow the speech") */
              .current-word {
                background-color: #fff59d;
                border-radius: 2px;
                box-shadow: 0 0 0 1px #fff59d;
              }

              /* Freestyle: inserted word whose timing is estimated (interpolated) */
              .stw-prov-estimated {
                text-decoration: underline dotted;
                text-decoration-color: #c4b5fd;
                text-underline-offset: 2px;
                color: #6b7280;
              }

              /* Freestyle per-sentence gutter (confidence badge + revert) */
              .stw-sentence-gutter {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-left: 8px;
                vertical-align: middle;
              }
              .stw-conf-badge {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                border: 1px solid rgba(0, 0, 0, 0.15);
              }
              .stw-est-dot {
                font-size: 10px;
                color: #8b5cf6;
              }
              .stw-revert-sentence {
                font: inherit;
                font-size: 11px;
                line-height: 1.4;
                border: 1px solid #d4d4d8;
                border-radius: 3px;
                background: #fff;
                color: #71717a;
                cursor: pointer;
                padding: 0 4px;
              }
              .stw-revert-sentence:hover {
                border-color: #18181b;
                color: #18181b;
              }

              /* word-level editing view */
              .stw-paragraph {
                margin-bottom: 0.6em;
              }
              .stw-word {
                cursor: pointer;
                border-radius: 2px;
              }
              .stw-word:hover {
                text-decoration: underline;
              }
              .stw-punct {
                cursor: default;
              }
              .stw-muted {
                text-decoration: line-through;
                color: #b0b0b0;
              }
              .stw-muted:hover {
                text-decoration: line-through underline;
              }
              .stw-word-input {
                font: inherit;
                border: 1px solid #1976d2;
                border-radius: 2px;
                padding: 0 2px;
              }
              .stw-edit-wrap {
                position: relative;
                display: inline-block;
              }
              .stw-edit-tools {
                position: absolute;
                bottom: 100%;
                left: 0;
                margin-bottom: 3px;
                display: inline-flex;
                gap: 3px;
                z-index: 5;
              }
              .stw-mute-btn,
              .stw-raw-btn {
                font: inherit;
                border: 1px solid #1976d2;
                border-radius: 3px;
                background: #fff;
                color: #1976d2;
                cursor: pointer;
                white-space: nowrap;
                display: inline-flex;
                align-items: center;
              }
              .stw-mute-btn,
              .stw-raw-btn {
                font-size: 11px;
                line-height: 1.5;
                padding: 0 5px;
              }
              .stw-mute-btn[aria-pressed='true'] {
                background: #1976d2;
                color: #fff;
              }
              .stw-mute-btn[aria-pressed='true']:hover {
                background: #145ea8;
                color: #fff;
              }
              .stw-mute-btn:hover,
              .stw-raw-btn:hover {
                background: #1976d2;
                color: #fff;
              }

              // NOTE: The CSS is here, coz if you put it as a separate index.css the current webpack does not bundle it with the component

              /* TODO: Temporary, need to scope this to the component in a sensible way */
              .editor-wrapper-container {
                font-family: Roboto, sans-serif;
              }

              .editor-wrapper-container {
                padding: 8px 16px;
                height: 85vh;
                overflow: auto;
              }
              /* https://developer.mozilla.org/en-US/docs/Web/CSS/user-select
              TODO: only working in Chrome, not working in Firefox, and Safari - OSX
              if selecting text, not showing selection
              Commented out because it means cannot select speakers and timecode anymore
              which is the intended default behavior but needs to come with export
              functionality to export as plain text, word etc.. otherwise user won't be able
              to get text out of component with timecodes and speaker names in the interim */
              .unselectable {
                -moz-user-select: none;
                -webkit-user-select: none;
                -ms-user-select: none;
                user-select: none;
              }
              .timecode:hover {
                text-decoration: underline;
              }
              .timecode.text:hover {
                text-decoration: none;
              }
          `}
        </style>
        {props.title && (
          <div style={{ marginBottom: '0.6em' }}>
            <Typography variant="h5">{props.title}</Typography>
          </div>
        )}
        <div style={{ marginBottom: '0.75em' }}>
          <EditorToolbar
            editable={editable}
            setEditable={setEditable}
            settings={settings}
            actions={actions}
            presets={presets}
            activePresetId={activePresetId}
            canStructuralEdit={editPolicy.allowsStructuralEdits}
            canShowAnnotations={!!editPolicy.supportsAnnotations}
            cutoffOptions={(profile.confidenceDefaults && profile.confidenceDefaults.cutoffOptions) || [0.75, 0.8, 0.85]}
            editingMode={editingMode}
            editingModes={editingModes}
            onEditingModeChange={onEditingModeChange}
            showEditingModeSwitch={showEditingModeSwitch}
            canStyle={!!(profile.versioning && profile.versioning.setStyles)}
            styleEnabled={!!(profile.versioning && profile.versioning.setStyles)}
            onApplyStyle={applyStyleToSelection}
            isProcessing={isProcessing}
            isContentSaved={isContentSaved}
            handleSave={handleSave}
            handleUndo={handleUndo}
            handleRedo={handleRedo}
            handleExport={handleExport}
            exporters={profile.exporters}
            onRevertToSaved={handleRevertToSaved}
            onRevertToImported={handleRevertToImported}
            handleReplaceText={handleReplaceText}
            insertTextInaudible={insertTextInaudible}
            handleInsertMusicNote={handleInsertMusicNote}
            onOpenPreferences={() => setPrefsOpen(true)}
            onShowRawSource={props.onShowRawSource}
          />
        </div>

        {hasFiles && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              borderBottom: `1px solid #e4e4e7`,
              marginBottom: 14,
              fontFamily: 'Inter, Roboto, system-ui, sans-serif',
            }}
          >
            {[
              ['video', 'Video'],
              ['files', 'Files'],
            ].map(([key, label]) => {
              const on = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    padding: '8px 12px',
                    color: on ? '#18181b' : '#71717a',
                    fontWeight: on ? 600 : 400,
                    boxShadow: on ? 'inset 0 -2px 0 #18181b' : 'none',
                  }}
                >
                  {label}
                  {key === 'files' ? ` (${props.files.length})` : ''}
                </button>
              );
            })}
          </div>
        )}

        {hasFiles && activeTab === 'files' && (
          <FilesPanel
            files={props.files}
            activeId={props.activeFileId}
            onSelect={(id) => {
              if (props.onSelectFile) props.onSelectFile(id);
              setActiveTab('video');
            }}
            onRemove={props.onRemoveFile}
          />
        )}

        <div style={{ display: hasFiles && activeTab !== 'video' ? 'none' : 'block' }}>
          <Grid container direction="row" spacing={2} sx={{ justifyContent: 'center', alignItems: 'stretch' }}>
            {!mediaCollapsed && (
              <Grid
                size={{ xs: 12, sm: 4, md: 4, lg: 4, xl: 4 }}
                container
                sx={{ flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch' }}
              >
                <Grid container spacing={2} sx={{ flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }}>
                  <Grid container sx={{ justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setMediaCollapsed(true)} style={MEDIA_TOGGLE_STYLE} title="Hide the media panel">
                      ‹ Hide media
                    </button>
                  </Grid>
                  <Grid container>
                    <video
                      style={{ backgroundColor: 'black' }}
                      ref={mediaRef}
                      src={props.mediaUrl}
                      width={'100%'}
                      // height="auto"
                      controls
                      playsInline
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    ></video>
                  </Grid>
                  {/* single-line transport (Hairline look): −10 / play / +30 · time · speed */}
                  <Grid container sx={{ alignItems: 'center' }} style={{ gap: 10, flexWrap: 'nowrap', marginTop: 4 }}>
                    <Tooltip title={<Typography variant="body1">{`Seek back ${seekStepSeconds} seconds`}</Typography>}>
                      <button type="button" style={CIRCLE_BTN_STYLE} onClick={handleSeekBack}>
                        −{seekStepSeconds}
                      </button>
                    </Tooltip>
                    <Tooltip title={<Typography variant="body1">Play / pause</Typography>}>
                      <button type="button" style={PLAY_BTN_STYLE} onClick={handlePlayPause} aria-label="Play or pause">
                        {isPlaying ? '❚❚' : '▶'}
                      </button>
                    </Tooltip>
                    <Tooltip title={<Typography variant="body1">{`Fast forward ${forwardStepSeconds} seconds`}</Typography>}>
                      <button type="button" style={CIRCLE_BTN_STYLE} onClick={handleFastForward}>
                        +{forwardStepSeconds}
                      </button>
                    </Tooltip>
                    <span style={{ width: 1, height: 18, background: '#e4e4e7', margin: '0 2px' }} />
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#18181b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {shortTimecode(currentTime)}
                      <span style={{ fontWeight: 400, fontSize: 12.5, color: '#a1a1aa' }}>
                        {duration ? ` / ${shortTimecode(duration)}` : ' / 00:00:00'}
                      </span>
                    </span>
                    <select
                      value={playbackRate}
                      onChange={handleSetPlaybackRate}
                      title="Playback speed"
                      style={{
                        marginLeft: 'auto',
                        border: '1px solid #d4d4d8',
                        borderRadius: 6,
                        padding: '3px 6px',
                        fontSize: 12,
                        color: '#71717a',
                        background: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      {PLAYBACK_RATE_VALUES.map((playbackRateValue, index) => (
                        <option key={index + playbackRateValue} value={playbackRateValue}>
                          {playbackRateValue}×
                        </option>
                      ))}
                    </select>
                  </Grid>
                  {/* <Grid>{props.children}</Grid> */}
                </Grid>
                <Grid>{props.children}</Grid>
              </Grid>
            )}

            <Grid
              size={{
                xs: 12,
                sm: mediaCollapsed ? 12 : 8,
                md: mediaCollapsed ? 12 : 8,
                lg: mediaCollapsed ? 12 : 8,
                xl: mediaCollapsed ? 12 : 8,
              }}
            >
              {mediaCollapsed && (
                <div style={{ marginBottom: 6 }}>
                  <button type="button" onClick={() => setMediaCollapsed(false)} style={MEDIA_TOGGLE_STYLE} title="Show the media panel">
                    › Show media
                  </button>
                </div>
              )}
              {value.length !== 0 ? (
                <>
                  <Paper elevation={3}>
                    <section
                      className="editor-wrapper-container"
                      style={{ fontSize: settings.appearance.fontSize, lineHeight: settings.appearance.lineSpacing }}
                    >
                      {/* ONE Slate surface for BOTH modes. Strict (`wordLevelEditing`) is
                          read-only — edits happen only via the double-click word popover —
                          so the two modes differ solely in the double-click gesture. */}
                      <Slate
                        key={slateKey}
                        editor={editor}
                        initialValue={value}
                        onChange={(newVal) => {
                          setValue(newVal);
                          if (wordLevelEditing) return; // Strict: commits go through the word popover, not typing
                          if (isFreestyle) {
                            // ignore caret-only changes; on a real edit, re-align (debounced)
                            const astChange = editor.operations.some((op) => op.type !== 'set_selection');
                            if (astChange) {
                              setIsContentIsModified(true);
                              setIsContentSaved(false);
                              commitFreestyleEdit();
                            }
                            return;
                          }
                          if (props.handleAutoSaveChanges) {
                            props.handleAutoSaveChanges(newVal);
                            setIsContentSaved(true);
                          }
                        }}
                      >
                        <Editable
                          readOnly={wordLevelEditing || !editable}
                          renderElement={renderElement}
                          renderLeaf={renderLeaf}
                          decorate={decorate}
                          onKeyDown={handleOnKeyDown}
                        />
                      </Slate>
                      {strictEdit && (
                        <StrictWordPopover
                          state={strictEdit}
                          onDraft={(draft) => setStrictEdit((s) => (s ? { ...s, draft } : s))}
                          onSave={saveStrictEdit}
                          onToggleMute={() => {
                            commitStrictWord(strictEdit.pIdx, strictEdit.wIdx, { muted: !strictEdit.muted });
                            setStrictEdit(null);
                          }}
                          onShowRaw={
                            props.onShowRawSource
                              ? () => {
                                  props.onShowRawSource({ key: strictEdit.wordKey, start: strictEdit.start });
                                  setStrictEdit(null);
                                }
                              : null
                          }
                          onCancel={() => setStrictEdit(null)}
                        />
                      )}
                    </section>
                  </Paper>
                </>
              ) : (
                <section className="text-center">
                  <i className="text-center">Loading...</i>
                </section>
              )}
            </Grid>
          </Grid>
        </div>
        <PreferencesDialog
          open={prefsOpen}
          onClose={() => setPrefsOpen(false)}
          profileFormat={profile.format}
          allowedModes={editingModes}
          editingMode={editingMode}
        />
      </Container>
    </div>
  );
}

export const transcriptHasConfidence = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.monologues)) {
    return data.monologues.some((m) => (m.elements || []).some((el) => el && el.type === 'text' && typeof el.confidence === 'number'));
  }
  if (Array.isArray(data.segments)) {
    return data.segments.some((s) => (s.words || []).some((w) => typeof w.score === 'number'));
  }
  if (Array.isArray(data.words)) {
    return data.words.some((w) => typeof w.confidence === 'number' || typeof w.score === 'number');
  }
  return false;
};

// Public component: owns the preferences store (localStorage + presets) and wraps
// the editor body so usePreferences() works throughout. Existing display/behavior
// props seed the store on first init (see seedSettingsFromProps).
function SlateTranscriptEditor(props) {
  const merged = { ...DEFAULT_PROPS, ...props };
  const hasConfidence = useMemo(() => transcriptHasConfidence(merged.transcriptData), [merged.transcriptData]);
  // A profile may declare format-specific confidence defaults (WhisperX scores run
  // far lower than rev.ai, so it lowers the cutoff/floor). Fold them into the
  // PreferencesProvider SEED only — host-provided confidence keys still win, and the
  // inner component keeps the original defaultPreferences so the values are a
  // freely-adjustable default rather than a host-controlled lock.
  const seededDefaultPreferences = useMemo(() => {
    const cd = whisperConfidenceDefaults(merged.transcriptData);
    if (!cd) return merged.defaultPreferences;
    const hostConf = (merged.defaultPreferences && merged.defaultPreferences.confidence) || {};
    return {
      ...merged.defaultPreferences,
      confidence: { cutoff: cd.cutoff, floor: cd.floor, sentenceCutoffDelta: cd.sentenceCutoffDelta, ...hostConf },
    };
  }, [merged.transcriptData, merged.defaultPreferences]);
  return (
    <PreferencesProvider
      seedProps={merged}
      defaultPreferences={seededDefaultPreferences}
      onPreferencesChange={merged.onPreferencesChange}
      hasConfidence={hasConfidence}
    >
      <SlateTranscriptEditorInner {...merged} />
    </PreferencesProvider>
  );
}

export default SlateTranscriptEditor;

SlateTranscriptEditor.propTypes = {
  transcriptData: PropTypes.object.isRequired,
  mediaUrl: PropTypes.string.isRequired,
  handleSaveEditor: PropTypes.func,
  handleAutoSaveChanges: PropTypes.func,
  autoSaveContentType: PropTypes.string,
  isEditable: PropTypes.bool,
  showTimecodes: PropTypes.bool,
  showSpeakers: PropTypes.bool,
  title: PropTypes.string,
  showTitle: PropTypes.bool,
  transcriptDataLive: PropTypes.object,
  followPlayback: PropTypes.bool,
  wordLevelEditing: PropTypes.bool,
  editingMode: PropTypes.oneOf(['auto', 'word', 'freestyle']),
  profile: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  onShowRawSource: PropTypes.func,
  onSentenceModel: PropTypes.func,
  defaultPreferences: PropTypes.object,
  onPreferencesChange: PropTypes.func,
  // Optional Video|Files tab bar — host supplies the document list + handlers.
  files: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, label: PropTypes.string, sublabel: PropTypes.string })),
  activeFileId: PropTypes.string,
  onSelectFile: PropTypes.func,
  onRemoveFile: PropTypes.func,
};

// defaults are applied via DEFAULT_PROPS at the top of the component (React 19
// no longer reads Component.defaultProps on function components).
