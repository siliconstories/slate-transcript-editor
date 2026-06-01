import React, { useState, useMemo, useEffect } from 'react';
import SlateTranscriptEditor from '../src/components/index.js';
import getMediaType from '../src/util/get-media-type';
import KATE_DPE from '../src/sample-data/KateDarling-dpe.json';
import SOLEIO_DPE from '../src/sample-data/soleio-dpe.json';
import GEMS_STRICT from '../src/util/rev-to-sentences/__fixtures__/GEMS-01.json';
import buildSentenceModel from '../src/util/rev-to-sentences';
import { detectProfile } from '../src/transcript-model/profile';
import { isRevTranscript, revToModel } from '../src/transcript-model/rev-overlay';
import converSlateToDpe from '../src/util/export-adapters/slate-to-dpe';
import RawSourceDialog from './RawSourceDialog.js';

const SAMPLES = {
  kate: {
    label: 'Kate Darling (TED)',
    title: 'TED Talk | Kate Darling - Why we have an emotional connection to robots',
    mediaUrl: 'https://download.ted.com/talks/KateDarling_2018S-950k.mp4',
    transcriptData: KATE_DPE,
  },
  soleio: {
    label: 'Soleio (PBS Frontline)',
    title: 'Soleio Interview, PBS Frontline',
    mediaUrl:
      'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4',
    transcriptData: SOLEIO_DPE,
  },
};

const revWordCount = (parsed) => parsed.monologues.reduce((n, m) => n + (m.elements || []).filter((e) => e.type === 'text').length, 0);

const docSublabel = (transcriptData) =>
  isRevTranscript(transcriptData) ? `rev.ai · rigid · ${revWordCount(transcriptData)} words` : 'DPE · classic';

// Seed documents: the bundled samples + the local strict-testing pair. Session
// uploads append to this list (see Playground state). Each carries the full payload.
const SEED_DOCUMENTS = [
  {
    id: 'kate',
    label: SAMPLES.kate.label,
    sublabel: docSublabel(SAMPLES.kate.transcriptData),
    mediaUrl: SAMPLES.kate.mediaUrl,
    mediaName: SAMPLES.kate.mediaUrl.split('/').pop(),
    transcriptData: SAMPLES.kate.transcriptData,
    title: SAMPLES.kate.title,
  },
  {
    id: 'soleio',
    label: SAMPLES.soleio.label,
    sublabel: docSublabel(SAMPLES.soleio.transcriptData),
    mediaUrl: SAMPLES.soleio.mediaUrl,
    mediaName: SAMPLES.soleio.mediaUrl.split('/').pop(),
    transcriptData: SAMPLES.soleio.transcriptData,
    title: SAMPLES.soleio.title,
  },
  {
    id: 'gems-strict',
    label: 'rev.ai strict testing',
    sublabel: docSublabel(GEMS_STRICT),
    mediaUrl: '/strict-media/GEMS-01.mp4',
    mediaName: 'GEMS-01.mp4',
    transcriptData: GEMS_STRICT,
    title: 'GEMS-01 — rev.ai strict testing',
  },
];

const isFiniteNumber = (n) => typeof n === 'number' && isFinite(n);

// Returns an error string, or null when the object is a valid DPE transcript.
const validateDpe = (data) => {
  if (!data || typeof data !== 'object') return 'Transcript must be a JSON object.';
  if (!Array.isArray(data.words) || data.words.length === 0) return 'Transcript is missing a non-empty "words" array.';
  if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) return 'Transcript is missing a non-empty "paragraphs" array.';
  const w = data.words[0];
  if (!isFiniteNumber(w.start) || !isFiniteNumber(w.end) || typeof w.text !== 'string') {
    return 'Each word needs numeric "start"/"end" and a string "text".';
  }
  const p = data.paragraphs[0];
  if (!isFiniteNumber(p.start) || !isFiniteNumber(p.end) || typeof p.speaker !== 'string') {
    return 'Each paragraph needs numeric "start"/"end" and a string "speaker".';
  }
  return null;
};

const styles = {
  wrap: { fontFamily: 'Roboto, system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '1em' },
  panel: { background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, padding: '1.4em 1.5em', marginBottom: '1.25em' },
  loadHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 17,
    fontWeight: 700,
    color: '#37474f',
  },
  row: { display: 'flex', flexWrap: 'wrap', gap: '2.5em', alignItems: 'flex-start', marginTop: '1em' },
  col: { display: 'flex', flexDirection: 'column', gap: '0.6em', minWidth: 280 },
  label: { fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: '#455a64', letterSpacing: 0.5 },
  btn: {
    cursor: 'pointer',
    border: '1px solid #1976d2',
    background: '#fff',
    color: '#1976d2',
    borderRadius: 6,
    padding: '9px 16px',
    fontSize: 15,
    fontWeight: 600,
  },
  urlInput: { padding: '9px 11px', border: '1px solid #bbb', borderRadius: 6, minWidth: 340, fontSize: 15 },
  error: { color: '#c62828', background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 12px', marginTop: '0.75em' },
  ok: { color: '#2e7d32', fontSize: 14 },
  toggles: { display: 'flex', gap: '1.4em', flexWrap: 'wrap', marginTop: '1.25em', fontSize: 15 },
  hint: { fontSize: 12, color: '#777' },
  tier: { display: 'flex', gap: '0.6em', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.8em' },
  badgeRigid: { background: '#1565c0', color: '#fff', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 600 },
  badgeClassic: { background: '#616161', color: '#fff', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 600 },
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

  const [isEditable, setIsEditable] = useState(true);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [wordLevelEditing, setWordLevelEditing] = useState(true);
  const [confidenceOverlay, setConfidenceOverlay] = useState(true);
  const [confidenceLevel, setConfidenceLevel] = useState('word');
  const [confidenceCutoff, setConfidenceCutoff] = useState(0.85);

  // The active transcript profile instance (classic for DPE, rigid for rev.ai).
  // The editor now owns import / edit-capture / versioning / faithful export;
  // the Playground just detects the tier and passes the instance down.
  const [profileInst, setProfileInst] = useState(null);
  const isRigid = profileInst ? profileInst.id === 'rigid' : false;

  // Corpus-level confidence (mean + duration-weighted) of the loaded transcript,
  // to help pick a threshold. null for non-rev (DPE) transcripts.
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

  // schema gate: must be a valid rev.ai ({ monologues }) or DPE ({ words, paragraphs }) doc
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
    const dpeErr = validateDpe(parsed);
    if (dpeErr) return `Not a rev.ai ({ monologues }) or DPE ({ words, paragraphs }) document. ${dpeErr}`;
    return null;
  };

  // current document as raw JSON: rigid -> faithful rev.ai (reflects mutes/rewrites);
  // classic -> current DPE from the live Slate value, falling back to the loaded source.
  const openRaw = (locator) => {
    let obj;
    if (isRigid && profileInst && Array.isArray(profileInst.exporters)) {
      const exporter = profileInst.exporters.find((e) => e.id === 'json-rev');
      obj = (exporter && exporter.run()) || transcriptData;
    } else {
      obj = liveValue ? converSlateToDpe(liveValue) : transcriptData;
    }
    setRawText(JSON.stringify(obj, null, 2));
    setRawLocator(locator && (locator.key != null || typeof locator.start === 'number') ? locator : null);
    setRawOpen(true);
  };

  // Save in the raw editor: re-import the edited document as a fresh transcript
  const applyRaw = (parsed) => {
    setProfileInst(detectProfile(parsed));
    setTranscriptData(parsed);
    setLiveValue(null);
    setRawOpen(false);
    remount();
  };

  // Load a complete document (sample or uploaded) into both panes. The Files tab
  // and the Load-section sample buttons both route through here.
  const selectDocument = (id) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    setError('');
    setUrlField('');
    setMediaUrl(doc.mediaUrl);
    setMediaName(doc.mediaName);
    setProfileInst(detectProfile(doc.transcriptData));
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
  // When both pendings are present, synthesize a descriptor, append, and select it.
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
    // select inline (selectDocument reads from `documents` which hasn't updated yet)
    setError('');
    setUrlField('');
    setMediaUrl(doc.mediaUrl);
    setMediaName(doc.mediaName);
    setProfileInst(detectProfile(doc.transcriptData));
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
      const detected = detectProfile(parsed);
      // DPE must validate; rev.ai (rigid) is accepted as-is.
      if (detected.id !== 'rigid') {
        const dpeError = validateDpe(parsed);
        if (dpeError) {
          setError(`Unsupported transcript format. Expected DPE ({ words, paragraphs }) or rev.ai ({ monologues }). ${dpeError}`);
          return;
        }
      }
      setError('');
      setPendingTranscript({ data: parsed, title: file.name.replace(/\.[^/.]+$/, ''), name: file.name });
    };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const ready = Boolean(mediaUrl) && Boolean(transcriptData);

  return (
    <div style={styles.wrap}>
      <h2>Slate Transcript Editor — Playground</h2>
      <p style={styles.hint}>
        Load a media file (video/audio) <strong>and</strong> a matching transcript in DPE JSON format (
        <code>{'{ words: [...], paragraphs: [...] }'}</code>), then edit and export. This tool does not generate transcripts — it edits an existing
        word-timed one.
      </p>

      <div style={styles.panel}>
        <div style={styles.loadHeader} onClick={() => setLoadOpen(!loadOpen)}>
          <span style={{ fontSize: 13 }}>{loadOpen ? '▾' : '▸'}</span>
          Load &amp; options
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 400, color: '#90a4ae' }}>{loadOpen ? '(click to collapse)' : '(click to expand)'}</span>
        </div>
        {loadOpen && (
          <>
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
                <span style={styles.label}>2 · Transcript (DPE JSON)</span>
                <input type="file" accept="application/json,.json" onChange={handleTranscriptFile} />
                {transcriptName && <span style={styles.ok}>✓ {transcriptName}</span>}
              </div>

              <div style={styles.col}>
                <span style={styles.label}>Or open a document (also in the Files tab)</span>
                {documents.map((d) => (
                  <button
                    key={d.id}
                    style={d.id === activeFileId ? { ...styles.btn, borderColor: '#18181b', color: '#18181b' } : styles.btn}
                    onClick={() => selectDocument(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {!isRigid && (
              <div style={styles.toggles}>
                <label title="Read-only base; double-click a word to edit it, Ctrl/Cmd-click to mute it">
                  <input
                    type="checkbox"
                    checked={wordLevelEditing}
                    onChange={(e) => {
                      setWordLevelEditing(e.target.checked);
                      remount();
                    }}
                  />{' '}
                  Word-level editing
                </label>
              </div>
            )}
          </>
        )}

        {error && <div style={styles.error}>{error}</div>}
        {!ready && !error && <p style={styles.hint}>Provide a media source and a valid transcript to start editing.</p>}
      </div>

      {ready && (
        <SlateTranscriptEditor
          key={mountKey}
          transcriptData={transcriptData}
          profile={profileInst}
          defaultPreferences={{ confidence: { overlay: confidenceOverlay, level: confidenceLevel, cutoff: confidenceCutoff } }}
          mediaUrl={mediaUrl}
          title={title}
          showTitle={showTitle}
          isEditable={isEditable}
          showSpeakers={showSpeakers}
          showTimecodes={showTimecodes}
          wordLevelEditing={wordLevelEditing}
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
          title={isRigid ? 'Raw rev.ai source (JSON)' : 'Raw DPE source (JSON)'}
          tier={isRigid ? 'rev' : 'dpe'}
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
