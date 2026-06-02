import React, { useState, useMemo, useEffect } from 'react';
import SlateTranscriptEditor from '../src/components/index.js';
import getMediaType from '../src/util/get-media-type';
import GEMS_STRICT from '../src/util/rev-to-sentences/__fixtures__/GEMS-01.json';
import buildSentenceModel from '../src/util/rev-to-sentences';
import { detectProfile } from '../src/transcript-model/profile';
import { isRevTranscript, revToModel } from '../src/transcript-model/rev-overlay';
import { isWhisperxTranscript, whisperxToModel } from '../src/transcript-model/whisperx-overlay';
import GEMS_UZH from '../src/sample-data/GEMS-01-UZH.json';
import RawSourceDialog from './RawSourceDialog.js';

// The two accepted import formats — rev.ai (monologues) and WhisperX (segments).
const formatOf = (data) => (isWhisperxTranscript(data) ? 'whisperx' : isRevTranscript(data) ? 'revai' : null);

// "20m:16s"-style length label (the spoken span the title used to show).
const formatMinSec = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}m:${String(s % 60).padStart(2, '0')}s`;
};

// Word count + spoken length (seconds), derived from the transcript itself.
const docStats = (data) => {
  let wordCount = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const span = (start, end) => {
    if (typeof start === 'number' && start < minStart) minStart = start;
    if (typeof end === 'number' && end > maxEnd) maxEnd = end;
  };
  if (isRevTranscript(data)) {
    data.monologues.forEach((m) =>
      (m.elements || []).forEach((e) => {
        if (e.type !== 'text') return;
        wordCount += 1;
        span(e.ts, e.end_ts);
      })
    );
  } else if (isWhisperxTranscript(data)) {
    data.segments.forEach((s) =>
      (s.words || []).forEach((w) => {
        wordCount += 1;
        span(w.start, w.end);
      })
    );
  }
  return { wordCount, duration: minStart < maxEnd ? maxEnd - minStart : 0 };
};

const docSublabel = (data) => {
  const tier = isRevTranscript(data) ? 'rev.ai' : isWhisperxTranscript(data) ? 'WhisperX' : 'unknown';
  const { wordCount, duration } = docStats(data);
  return `${tier} · ${formatMinSec(duration)} · ${wordCount} words`;
};

// Seed documents: the GEMS-01 interview in BOTH accepted formats (rev.ai + WhisperX),
// so you can compare the two STT formats on one clip. Uploads append to this list.
const SEED_DOCUMENTS = [
  {
    id: 'gems-strict',
    label: 'GEMS-01 (rev.ai)',
    sublabel: docSublabel(GEMS_STRICT),
    mediaUrl: '/strict-media/GEMS-01.mp4',
    mediaName: 'GEMS-01.mp4',
    transcriptData: GEMS_STRICT,
    title: 'GEMS-01 — rev.ai',
  },
  {
    // Same GEMS-01 interview, transcribed + annotated by WhisperX (UZH).
    id: 'gems-uzh',
    label: 'GEMS-01 (UZH · WhisperX)',
    sublabel: docSublabel(GEMS_UZH),
    mediaUrl: '/strict-media/GEMS-01.mp4',
    mediaName: 'GEMS-01.mp4',
    transcriptData: GEMS_UZH,
    title: 'GEMS-01 — UZH annotated (WhisperX)',
  },
];

const styles = {
  wrap: { fontFamily: 'Roboto, system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '1em' },
  panel: { background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, padding: '1em 1.2em', marginBottom: '1em' },
  loadHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 15,
    fontWeight: 700,
    color: '#37474f',
  },
  row: { display: 'flex', flexWrap: 'wrap', gap: '1.5em', alignItems: 'flex-start', marginTop: '0.85em' },
  col: { display: 'flex', flexDirection: 'column', gap: '0.45em', flex: '1 1 230px', minWidth: 210 },
  label: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: '#455a64', letterSpacing: 0.4 },
  btn: {
    cursor: 'pointer',
    border: '1px solid #1976d2',
    background: '#fff',
    color: '#1976d2',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 13,
    fontWeight: 600,
  },
  urlInput: { padding: '6px 9px', border: '1px solid #bbb', borderRadius: 6, flex: 1, minWidth: 0, fontSize: 13 },
  error: { color: '#c62828', background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 12px', marginTop: '0.75em' },
  ok: { color: '#2e7d32', fontSize: 12.5 },
  toggles: { display: 'flex', gap: '1.4em', flexWrap: 'wrap', marginTop: '1em', fontSize: 13 },
  docGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  docBtn: {
    cursor: 'pointer',
    border: '1px solid #1976d2',
    background: '#fff',
    color: '#1976d2',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: 12, color: '#777' },
};

function Playground() {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [urlField, setUrlField] = useState('');
  const [transcriptData, setTranscriptData] = useState(null);
  const [transcriptName, setTranscriptName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  // bumped every time inputs change, to force a fresh mount of the editor
  // (SlateTranscriptEditor reads transcriptData only once, on mount)
  const [mountKey, setMountKey] = useState(0);
  const [loadOpen, setLoadOpen] = useState(true);

  const [isEditable] = useState(true);
  const [showSpeakers] = useState(true);
  const [showTimecodes] = useState(true);
  const [showTitle] = useState(true);
  const [confidenceOverlay] = useState(true);
  const [confidenceLevel] = useState('word');
  const [confidenceCutoff] = useState(0.85);

  // The active transcript profile instance (the unified `whisper` profile). The editor
  // owns import / edit-capture / versioning / faithful export; the Playground detects
  // the source format from the data for its own labels and raw-source dialog.
  const [profileInst, setProfileInst] = useState(null);
  const dataFormat = formatOf(transcriptData);
  const isRev = dataFormat === 'revai';
  const isWhisperx = dataFormat === 'whisperx';

  // Corpus-level confidence (mean + duration-weighted) of the loaded transcript.
  const corpus = useMemo(() => {
    if (!transcriptData) return null;
    const model = buildSentenceModel(transcriptData);
    return model && Array.isArray(model.confidence) && model.confidence[0] != null ? model : null;
  }, [transcriptData]);

  const remount = () => setMountKey((k) => k + 1);

  // Documents listed in the editor's Files tab: seeded with the bundled samples,
  // appended by session uploads. The active row is highlighted via activeFileId.
  const [documents, setDocuments] = useState(SEED_DOCUMENTS);
  const [activeFileId, setActiveFileId] = useState(null);
  const [uploadCounter, setUploadCounter] = useState(0);
  const [pendingMedia, setPendingMedia] = useState(null); // { url, name }
  const [pendingTranscript, setPendingTranscript] = useState(null); // { data, title, name }

  // raw-source editor (CodeMirror lightbox) — edits the current document JSON
  const [liveValue, setLiveValue] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawLocator, setRawLocator] = useState(null);

  // schema gate: must be a valid rev.ai ({ monologues }) or WhisperX ({ segments, word_segments }) doc
  const validateRaw = (parsed) => {
    if (isRevTranscript(parsed)) {
      const allowed = ['text', 'punct', 'unknown'];
      for (const m of parsed.monologues) {
        for (const el of m.elements || []) {
          if (el && !allowed.includes(el.type)) {
            return `Invalid element "type": ${JSON.stringify(el.type)}. Allowed: text, punct, unknown.`;
          }
        }
      }
      try {
        revToModel(parsed);
        return null;
      } catch (e) {
        return `Invalid rev.ai data — ${e.message}`;
      }
    }
    if (isWhisperxTranscript(parsed)) {
      try {
        whisperxToModel(parsed);
        return null;
      } catch (e) {
        return `Invalid WhisperX data — ${e.message}`;
      }
    }
    return 'Not a rev.ai ({ monologues }) or WhisperX ({ segments, word_segments }) document.';
  };

  // current document as raw JSON: the active profile's faithful exporter reflects
  // mutes/rewrites; falls back to the loaded source before the first edit.
  const openRaw = (locator) => {
    const faithful = profileInst && Array.isArray(profileInst.exporters) ? profileInst.exporters.find((e) => e.ext === 'json') : null;
    const obj = faithful && faithful.run() ? faithful.run() : transcriptData;
    setRawText(JSON.stringify(obj, null, 2));
    setRawLocator(locator && (locator.key != null || typeof locator.start === 'number') ? locator : null);
    setRawOpen(true);
  };

  // Save in the raw editor: re-import the edited document as a fresh transcript
  const applyRaw = (parsed) => {
    try {
      setProfileInst(detectProfile(parsed));
    } catch (e) {
      setError(e.message);
      return;
    }
    setTranscriptData(parsed);
    setLiveValue(null);
    setRawOpen(false);
    remount();
  };

  // Load a complete document (sample or uploaded) into both panes.
  const selectDocument = (id) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    setError('');
    setUrlField('');
    setMediaUrl(doc.mediaUrl);
    setMediaName(doc.mediaName);
    try {
      setProfileInst(detectProfile(doc.transcriptData));
    } catch (e) {
      setError(e.message);
      return;
    }
    setTranscriptData(doc.transcriptData);
    setTranscriptName(doc.label);
    setTitle(doc.title);
    setActiveFileId(id);
    remount();
  };

  const removeDocument = (id) => {
    setDocuments((docs) => docs.filter((d) => d.id !== id));
  };

  // Uploads arrive as separate media + transcript files; pair them into one document.
  useEffect(() => {
    if (!pendingMedia || !pendingTranscript) return;
    const id = `uploaded-${uploadCounter + 1}`;
    const doc = {
      id,
      label: pendingTranscript.title || pendingMedia.name,
      sublabel: docSublabel(pendingTranscript.data),
      mediaUrl: pendingMedia.url,
      mediaName: pendingMedia.name,
      transcriptData: pendingTranscript.data,
      title: pendingTranscript.title || pendingMedia.name,
    };
    setUploadCounter((n) => n + 1);
    setDocuments((docs) => [...docs, doc]);
    setPendingMedia(null);
    setPendingTranscript(null);
    setError('');
    setUrlField('');
    setMediaUrl(doc.mediaUrl);
    setMediaName(doc.mediaName);
    try {
      setProfileInst(detectProfile(doc.transcriptData));
    } catch (e) {
      setError(e.message);
      return;
    }
    setTranscriptData(doc.transcriptData);
    setTranscriptName(doc.label);
    setTitle(doc.title);
    setActiveFileId(id);
    remount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMedia, pendingTranscript]);

  const handleMediaFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPendingMedia({ url: URL.createObjectURL(file), name: file.name });
  };

  const handleMediaUrl = () => {
    const url = urlField.trim();
    if (!url) return;
    setPendingMedia({ url, name: url.split('/').pop() });
    setUrlField('');
  };

  const handleTranscriptFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        setError(`Could not parse JSON: ${err.message}`);
        return;
      }
      if (!formatOf(parsed)) {
        setError('Unsupported transcript format. Expected rev.ai ({ monologues }) or WhisperX ({ segments, word_segments }).');
        return;
      }
      setError('');
      setPendingTranscript({ data: parsed, title: file.name.replace(/\.[^/.]+$/, ''), name: file.name });
    };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const ready = Boolean(mediaUrl) && Boolean(transcriptData);

  // Collapse the Load & options panel once content is loaded.
  useEffect(() => {
    if (ready) setLoadOpen(false);
  }, [ready]);

  return (
    <div style={styles.wrap}>
      <h2>Slate Transcript Editor — Playground</h2>
      <p style={styles.hint}>
        Load a media file (video/audio) <strong>and</strong> a matching transcript in <code>rev.ai</code> ({'{ monologues: [...] }'}) or{' '}
        <code>WhisperX</code> ({'{ segments: [...], word_segments: [...] }'}) JSON, then edit and export. This tool does not generate transcripts — it
        edits an existing word-timed one.
      </p>

      <div style={styles.panel}>
        <div style={styles.loadHeader} onClick={() => setLoadOpen(!loadOpen)}>
          <span style={{ fontSize: 13 }}>{loadOpen ? '▾' : '▸'}</span>
          Load &amp; options
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 400, color: '#90a4ae' }}>{loadOpen ? '(click to collapse)' : '(click to expand)'}</span>
        </div>
        {loadOpen && (
          <div style={styles.row}>
            <div style={styles.col}>
              <span style={styles.label}>1 · Media</span>
              <input type="file" accept="video/*,audio/*" onChange={handleMediaFile} />
              <div style={{ display: 'flex', gap: '0.4em' }}>
                <input
                  style={styles.urlInput}
                  type="text"
                  placeholder="…or paste a video/audio URL"
                  value={urlField}
                  onChange={(e) => setUrlField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMediaUrl();
                  }}
                />
                <button style={styles.btn} onClick={handleMediaUrl}>
                  Use URL
                </button>
              </div>
              {mediaName && (
                <span style={styles.ok}>
                  ✓ {mediaName} <em>({getMediaType(mediaName)})</em>
                </span>
              )}
            </div>

            <div style={styles.col}>
              <span style={styles.label}>2 · Transcript (rev.ai / WhisperX JSON)</span>
              <input type="file" accept="application/json,.json" onChange={handleTranscriptFile} />
              {transcriptName && <span style={styles.ok}>✓ {transcriptName}</span>}
            </div>

            <div style={styles.col}>
              <span style={styles.label}>Or open a document</span>
              <div style={styles.docGrid}>
                {documents.map((d) => (
                  <button
                    key={d.id}
                    style={d.id === activeFileId ? { ...styles.docBtn, borderColor: '#18181b', color: '#18181b' } : styles.docBtn}
                    onClick={() => selectDocument(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
        {!ready && !error && <p style={styles.hint}>Provide a media source and a valid transcript to start editing.</p>}
      </div>

      {ready && (
        <SlateTranscriptEditor
          key={mountKey}
          transcriptData={transcriptData}
          profile={profileInst}
          defaultPreferences={{
            confidence: { overlay: confidenceOverlay, level: confidenceLevel, cutoff: profileInst?.confidenceDefaults?.cutoff ?? confidenceCutoff },
          }}
          mediaUrl={mediaUrl}
          title={title}
          showTitle={showTitle}
          isEditable={isEditable}
          showSpeakers={showSpeakers}
          showTimecodes={showTimecodes}
          onShowRawSource={openRaw}
          files={documents.map(({ id, label, sublabel }) => ({ id, label, sublabel }))}
          activeFileId={activeFileId}
          onSelectFile={selectDocument}
          onRemoveFile={removeDocument}
          handleSaveEditor={(content) => console.log('handleSaveEditor', content)}
          handleAutoSaveChanges={(content) => setLiveValue(content)}
          onSentenceModel={(model) => console.log('onSentenceModel', model)}
          handleAnalyticsEvents={(name, payload) => console.log('analytics', name, payload)}
        />
      )}

      {rawOpen && (
        <RawSourceDialog
          title={isRev ? 'Raw rev.ai source (JSON)' : isWhisperx ? 'Raw WhisperX source (JSON)' : 'Raw source (JSON)'}
          tier={isRev ? 'rev' : isWhisperx ? 'whisperx' : 'rev'}
          openTo={rawLocator}
          initialText={rawText}
          validate={validateRaw}
          onCancel={() => setRawOpen(false)}
          onSave={applyRaw}
        />
      )}
    </div>
  );
}

export default Playground;
