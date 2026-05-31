import React, { useState } from 'react';
import SlateTranscriptEditor from '../src/components/index.js';
import getMediaType from '../src/util/get-media-type';
import KATE_DPE from '../src/sample-data/KateDarling-dpe.json';
import SOLEIO_DPE from '../src/sample-data/soleio-dpe.json';
import REV_SAMPLE from './sample-data/rev-ai-sample.json';
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
  panel: { background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 8, padding: '1em', marginBottom: '1em' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '1.5em', alignItems: 'flex-start' },
  col: { display: 'flex', flexDirection: 'column', gap: '0.4em', minWidth: 240 },
  label: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#555', letterSpacing: 0.4 },
  btn: { cursor: 'pointer', border: '1px solid #1976d2', background: '#fff', color: '#1976d2', borderRadius: 4, padding: '6px 12px', fontSize: 14 },
  urlInput: { padding: '6px 8px', border: '1px solid #bbb', borderRadius: 4, minWidth: 320, fontSize: 14 },
  error: { color: '#c62828', background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 12px', marginTop: '0.5em' },
  ok: { color: '#2e7d32', fontSize: 13 },
  toggles: { display: 'flex', gap: '1.2em', flexWrap: 'wrap', marginTop: '0.5em' },
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

  const [isEditable, setIsEditable] = useState(true);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [wordLevelEditing, setWordLevelEditing] = useState(true);

  // The active transcript profile instance (classic for DPE, rigid for rev.ai).
  // The editor now owns import / edit-capture / versioning / faithful export;
  // the Playground just detects the tier and passes the instance down.
  const [profileInst, setProfileInst] = useState(null);
  const isRigid = profileInst ? profileInst.id === 'rigid' : false;

  const remount = () => setMountKey((k) => k + 1);

  const revWordCount = (parsed) => parsed.monologues.reduce((n, m) => n + (m.elements || []).filter((e) => e.type === 'text').length, 0);

  // raw-source editor (CodeMirror lightbox) — edits the current document JSON
  const [liveValue, setLiveValue] = useState(null);
  // latest sentence-level "shadow" emitted by the editor (rigid only), debounced
  const [sentenceModel, setSentenceModel] = useState(null);
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

  // Download the derived sentence-level shadow as <name>.sentences.json.
  const downloadSentences = () => {
    if (!sentenceModel) return;
    const blob = new Blob([JSON.stringify(sentenceModel, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(transcriptName || 'transcript').replace(/\.json$/i, '')}.sentences.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save in the raw editor: re-import the edited document as a fresh transcript
  const applyRaw = (parsed) => {
    setProfileInst(detectProfile(parsed));
    setTranscriptData(parsed);
    setLiveValue(null);
    setRawOpen(false);
    remount();
  };

  const handleMediaFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setMediaUrl(objectUrl);
    setMediaName(file.name);
    setUrlField('');
    remount();
  };

  const handleMediaUrl = () => {
    const url = urlField.trim();
    if (!url) return;
    setMediaUrl(url);
    setMediaName(url.split('/').pop());
    remount();
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
        setTranscriptData(null);
        setError(`Could not parse JSON: ${err.message}`);
        return;
      }
      // give the Title checkbox something to toggle for uploaded files
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
      const detected = detectProfile(parsed);
      // rev.ai → rigid/faithful tier (immutable original + overlay); DPE → classic free-text.
      if (detected.id === 'rigid') {
        setError('');
        setProfileInst(detected);
        setTranscriptData(parsed);
        setTranscriptName(`${file.name} — rev.ai (rigid, ${revWordCount(parsed)} words, faithful round-trip)`);
        remount();
        return;
      }
      // DPE → classic free-text tier.
      const dpeError = validateDpe(parsed);
      if (dpeError) {
        setTranscriptData(null);
        setError(`Unsupported transcript format. Expected DPE ({ words, paragraphs }) or rev.ai ({ monologues }). ${dpeError}`);
        return;
      }
      setProfileInst(detected);
      setError('');
      setTranscriptData(parsed);
      setTranscriptName(file.name);
      remount();
    };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const loadSample = (sample) => {
    setError('');
    setMediaUrl(sample.mediaUrl);
    setMediaName(sample.mediaUrl.split('/').pop());
    setUrlField('');
    setProfileInst(detectProfile(sample.transcriptData));
    setTranscriptData(sample.transcriptData);
    setTranscriptName(`${sample.label} (bundled)`);
    setTitle(sample.title);
    remount();
  };

  const loadRevSample = () => {
    setError('');
    setMediaUrl('https://download.ted.com/talks/KateDarling_2018S-950k.mp4');
    setMediaName('KateDarling_2018S-950k.mp4');
    setUrlField('');
    setTitle('rev.ai sample (rigid / faithful)');
    setProfileInst(detectProfile(REV_SAMPLE));
    setTranscriptData(REV_SAMPLE);
    setTranscriptName(`rev.ai sample — rigid (${revWordCount(REV_SAMPLE)} words, faithful round-trip)`);
    remount();
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
            <span style={styles.label}>Or load a bundled sample</span>
            {Object.keys(SAMPLES).map((k) => (
              <button key={k} style={styles.btn} onClick={() => loadSample(SAMPLES[k])}>
                {SAMPLES[k].label}
              </button>
            ))}
            <button style={{ ...styles.btn, borderColor: '#1565c0', color: '#1565c0', fontWeight: 600 }} onClick={loadRevSample}>
              rev.ai sample (rigid)
            </button>
          </div>
        </div>

        <div style={styles.toggles}>
          <label>
            <input type="checkbox" checked={isEditable} onChange={(e) => setIsEditable(e.target.checked)} /> Editable
          </label>
          <label>
            <input type="checkbox" checked={showSpeakers} onChange={(e) => setShowSpeakers(e.target.checked)} /> Speakers
          </label>
          <label>
            <input type="checkbox" checked={showTimecodes} onChange={(e) => setShowTimecodes(e.target.checked)} /> Timecodes
          </label>
          <label>
            <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} /> Title
          </label>
          {!isRigid && (
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
          )}
        </div>

        {ready && (
          <div style={styles.tier}>
            {isRigid ? (
              <>
                <span style={styles.badgeRigid}>rev.ai · rigid (faithful)</span>
                <span style={styles.hint}>
                  Read-only base · double-click a word to rewrite · Alt/Opt-click to play/pause · Ctrl/Cmd-click to mute. The “rev.ai (faithful)”
                  export plus Undo/Redo now live in the editor’s side menu →
                </span>
              </>
            ) : (
              <span style={styles.badgeClassic}>DPE · classic (copyedit)</span>
            )}
            <button style={styles.btn} onClick={() => openRaw()} title="Edit the raw source document (JSON)">
              Raw…
            </button>
            {isRigid && (
              <button
                style={styles.btn}
                onClick={downloadSentences}
                disabled={!sentenceModel}
                title="Download the derived sentence-level shadow JSON (updates live as you edit words)"
              >
                Sentences{sentenceModel ? ` (${sentenceModel.sentence_count})` : ''}…
              </button>
            )}
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
          mediaUrl={mediaUrl}
          title={title}
          showTitle={showTitle}
          isEditable={isEditable}
          showSpeakers={showSpeakers}
          showTimecodes={showTimecodes}
          wordLevelEditing={wordLevelEditing}
          onShowRawSource={openRaw}
          handleSaveEditor={(content) => console.log('handleSaveEditor', content)}
          handleAutoSaveChanges={(content) => setLiveValue(content)}
          onSentenceModel={(model) => {
            setSentenceModel(model);
            console.log('onSentenceModel', model);
          }}
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
