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
import { createEditor, Editor, Transforms, Text } from 'slate';
// https://docs.slatejs.org/walkthroughs/01-installing-slate
// Import the Slate components and React plugin.
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';

import EditorToolbar from './EditorToolbar';
import FilesPanel from './FilesPanel';
import { shortTimecode } from '../util/timecode-converter';
import download from '../util/downlaod/index.js';
import convertDpeToSlate from '../util/dpe-to-slate';
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
import WordLevelEditor from './WordLevelEditor';
import SlateHelpers from './slate-helpers';
import { resolveProfile } from '../transcript-model/profile';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { usePreferences } from '../preferences/PreferencesContext';
import buildConfidenceDecorations from '../util/confidence-decorations';
import { confidenceOf, round } from '../util/rev-to-sentences';
import PreferencesDialog from './PreferencesDialog';
import '../styles/toolbar.css';

const PLAYBACK_RATE_VALUES = [0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5];
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

// "01m:53s"-style duration for the title stats.
const formatMinSec = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}m:${String(s % 60).padStart(2, '0')}s`;
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
};

function SlateTranscriptEditorInner(props) {
  props = { ...DEFAULT_PROPS, ...props };
  const { settings, actions, presets, activePresetId } = usePreferences();
  const seekStepSeconds = settings.playback.seekStepSeconds;
  const forwardStepSeconds = settings.playback.forwardStepSeconds;
  const [prefsOpen, setPrefsOpen] = useState(false);
  // Video|Files view tabs — only shown when the host supplies a `files` list.
  const [activeTab, setActiveTab] = useState('video');
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
  const editor = useMemo(() => withReact(withHistory(createEditor())), []);
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
    const sentenceExporter = (profile.exporters || []).find((e) => e.id === 'json-rev-sentences');
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
      const { value: importedValue } = profile.import(props.transcriptData);
      setValue(importedValue);
      importedValueRef.current = cloneValue(importedValue);
      lastSavedValueRef.current = cloneValue(importedValue);
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
      const nodes = convertDpeToSlate(props.transcriptDataLive);
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
  const wordLevelEditing = editPolicy.wordLevelOnly === true ? true : settings.editing.wordLevelEditing;

  // seek + play for the word-level editor (single click on a word)
  // single-click: move the playhead to the word but do NOT change play state
  const seekWord = (seconds) => {
    if (mediaRef && mediaRef.current && typeof seconds === 'number') {
      mediaRef.current.currentTime = seconds;
      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_timed_text_click', {
          fn: 'wordLevelSeek',
          clickOrigin: 'word',
          timeInSeconds: seconds,
        });
      }
    }
  };

  // jump to a word/paragraph and start playing (used by the paragraph timecode click)
  const seekAndPlayWord = (seconds) => {
    if (mediaRef && mediaRef.current && typeof seconds === 'number') {
      mediaRef.current.currentTime = seconds;
      mediaRef.current.play();
      if (props.handleAnalyticsEvents) {
        props.handleAnalyticsEvents('ste_handle_timed_text_click', {
          fn: 'wordLevelPlay',
          clickOrigin: 'word',
          timeInSeconds: seconds,
        });
      }
    }
  };

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
    // a versioned profile (rigid) records each word-level edit as a snapshot
    if (profile.versioning) {
      profile.versioning.snapshot(newValue);
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

  // Corpus stats shown below the title (word count, length, mean/dur-weighted confidence).
  const transcriptStats = useMemo(() => {
    const words = [];
    let minStart = Infinity;
    let maxEnd = -Infinity;
    (value || []).forEach((p) => {
      const ws = p && p.children && p.children[0] && p.children[0].words;
      if (!Array.isArray(ws)) return;
      ws.forEach((w) => {
        if (typeof w.text !== 'string' || w.text.length === 0) return;
        words.push(w);
        if (typeof w.start === 'number' && w.start < minStart) minStart = w.start;
        if (typeof w.end === 'number' && w.end > maxEnd) maxEnd = w.end;
      });
    });
    if (words.length === 0) return null;
    const [mean, weighted] = confidenceOf(words);
    return { wordCount: words.length, duration: minStart < maxEnd ? round(maxEnd - minStart, 2) : 0, mean, weighted };
  }, [value]);

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
      return ranges;
    },
    [followPlayback, activeWordIndex, wordMap, confidenceDecos]
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
    // showSpeakers/showTimecodes are closed over by TimedTextElement; without them
    // here Slate keeps the stale closure and the classic editor ignores the toggles.
    [showSpeakers, showTimecodes]
  );

  // NOTE: activeWordIndex is intentionally in the dependency list even though it
  // is not referenced here. slate-react 0.59 memoizes leaves and only re-renders
  // them when `renderLeaf` identity (or a leaf's own decorations) changes. By
  // giving renderLeaf a fresh identity whenever the active word changes, the
  // leaves re-render and pick up the `currentWord` decoration produced above.
  const renderLeaf = useCallback(
    ({ attributes, children, leaf }) => {
      const className = leaf.currentWord ? 'timecode text current-word' : 'timecode text';
      // active (karaoke) word keeps its yellow bg; otherwise paint the confidence wash
      const style = !leaf.currentWord && leaf.confidenceStyle ? { backgroundColor: leaf.confidenceStyle, borderRadius: '2px' } : undefined;
      return (
        <span
          onDoubleClick={handleTimedTextClick}
          className={className}
          style={style}
          data-start={children.props.parent.start}
          data-previous-timings={children.props.parent.previousTimings}
          data-confidence-band={leaf.confidenceBand || undefined}
          {...attributes}
        >
          {children}
        </span>
      );
    },
    [activeWordIndex, confidenceDecos]
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

      if (isContentModified && type === 'json-digitalpaperedit') {
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
      const format = settings.editing.autoSaveContentType || 'digitalpaperedit';
      const editorContnet = await handleExport({ type: `json-${format}`, isDownload: false });
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
      profile.versioning.undo();
      replaceSlateValue(profile.reproject());
      return;
    }
    editor.undo();
  };

  const handleRedo = () => {
    if (profile.versioning) {
      profile.versioning.redo();
      replaceSlateValue(profile.reproject());
      return;
    }
    editor.redo();
  };

  // const debounced_version = throttle(handleRestoreTimecodes, 3000, { leading: false, trailing: true });
  // TODO: revisit logic for
  // - splitting paragraph via enter key
  // - merging paragraph via delete
  // - merging paragraphs via deleting across paragraphs
  const handleOnKeyDown = async (event) => {
    setIsContentIsModified(true);
    setIsContentSaved(false);
    // profiles that forbid structural edits (rigid) block paragraph split/merge
    if (editPolicy.allowsStructuralEdits === false) {
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
        {settings.display.showTitle && (
          <div style={{ marginBottom: '0.6em' }}>
            <Typography variant="h5">{props.title}</Typography>
            {transcriptStats && (
              <div style={{ lineHeight: 1.25 }}>
                <Typography variant="subtitle1" color="textSecondary" component="div">
                  {formatMinSec(duration > 0 ? duration : transcriptStats.duration)}
                </Typography>
                <Typography variant="body2" color="textSecondary" component="div">
                  {transcriptStats.wordCount} words
                  {transcriptStats.mean != null ? ` · confidence ${transcriptStats.mean} mean / ${transcriptStats.weighted} dur-weighted` : ''}
                </Typography>
              </div>
            )}
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
            <Grid
              size={{ xs: 12, sm: 4, md: 4, lg: 4, xl: 4 }}
              container
              sx={{ flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch' }}
            >
              <Grid container spacing={2} sx={{ flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }}>
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

            <Grid size={{ xs: 12, sm: 8, md: 8, lg: 8, xl: 8 }}>
              {value.length !== 0 ? (
                <>
                  <Paper elevation={3}>
                    <section
                      className="editor-wrapper-container"
                      style={{ fontSize: settings.appearance.fontSize, lineHeight: settings.appearance.lineSpacing }}
                    >
                      {wordLevelEditing ? (
                        <WordLevelEditor
                          value={value}
                          setValue={setValue}
                          confidenceOverlay={confidenceSettings}
                          isEditable={editable}
                          showSpeakers={showSpeakers}
                          showTimecodes={showTimecodes}
                          currentTime={currentTime}
                          followPlayback={followPlayback}
                          onSeek={seekWord}
                          onSeekAndPlay={seekAndPlayWord}
                          onSeekAndTogglePlay={seekAndTogglePlayWord}
                          onContentChange={handleWordLevelContentChange}
                          onSetSpeakerName={handleSetSpeakerName}
                          onShowRawSource={props.onShowRawSource}
                        />
                      ) : (
                        <Slate
                          key={slateKey}
                          editor={editor}
                          initialValue={value}
                          onChange={(value) => {
                            if (props.handleAutoSaveChanges) {
                              props.handleAutoSaveChanges(value);
                              setIsContentSaved(true);
                            }
                            return setValue(value);
                          }}
                        >
                          <Editable
                            readOnly={!editable}
                            renderElement={renderElement}
                            renderLeaf={renderLeaf}
                            decorate={decorate}
                            onKeyDown={handleOnKeyDown}
                          />
                        </Slate>
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
        <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} profileId={profile.id} />
      </Container>
    </div>
  );
}

const transcriptHasConfidence = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.monologues)) {
    return data.monologues.some((m) => (m.elements || []).some((el) => el && el.type === 'text' && typeof el.confidence === 'number'));
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
  return (
    <PreferencesProvider
      seedProps={merged}
      defaultPreferences={merged.defaultPreferences}
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
