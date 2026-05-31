/**
 * rev.ai (word-level) → sentence-level "shadow" model.
 *
 * Pure, synchronous, and DEPENDENCY-FREE on purpose: the batch CLI
 * (demo/rev-to-sentences-cli.js) loads this one file through an in-memory Babel
 * shim that passes node's `require`, so a relative/sibling import here would not
 * resolve. The opt-in sbd segmenter therefore lives in a separate module
 * (./split-sentences) and is passed in via `options.splitter`.
 *
 * Output is byte-faithful to the reference produced by the upstream Python tool
 * (verified against GEMS-01.json ↔ GEMS-01.sentences.json), including key order
 * and `Number(x.toFixed(dp))` rounding semantics.
 */

export const DEFAULT_TERMINAL = /[.!?…]/;

export const isRevTranscript = (obj) => Boolean(obj) && typeof obj === 'object' && Array.isArray(obj.monologues);

export const round = (n, dp) => Number(n.toFixed(dp));

const wordFromElement = (el) => ({ value: el.value, start: el.ts, end: el.end_ts, confidence: el.confidence });

// [mean, duration_weighted] over the words that carry a numeric confidence.
export const confidenceOf = (words) => {
  const scored = words.filter((w) => typeof w.confidence === 'number');
  if (scored.length === 0) return [null, null];
  const mean = scored.reduce((sum, w) => sum + w.confidence, 0) / scored.length;
  let weighted = 0;
  let totalDur = 0;
  scored.forEach((w) => {
    const dur = w.end - w.start;
    weighted += w.confidence * dur;
    totalDur += dur;
  });
  const durationWeighted = totalDur === 0 ? mean : weighted / totalDur;
  return [round(mean, 3), round(durationWeighted, 3)];
};

const makeSentence = (words, textParts) => ({
  text: textParts.join('').trim(),
  ts: words[0].start,
  end_ts: words[words.length - 1].end,
  confidence: confidenceOf(words),
  word_count: words.length,
});

// DEFAULT splitter: close a sentence on a terminal PUNCT *element* (not on a
// word's text), so an in-word ellipsis token like "ich..." stays mid-sentence.
const splitOnTerminalPunct = (elements, terminal) => {
  const sentences = [];
  let words = [];
  let textParts = [];
  const flush = () => {
    if (words.length > 0) sentences.push(makeSentence(words, textParts));
    words = [];
    textParts = [];
  };
  elements.forEach((el) => {
    const value = el.value != null ? el.value : '';
    if (el.type === 'text') {
      words.push(wordFromElement(el));
      textParts.push(value);
    } else {
      textParts.push(value);
      if (terminal.test(value)) flush();
    }
  });
  flush();
  return sentences;
};

// Find the start offset of each sentence piece within the reconstructed text,
// scanning forward so repeated phrases map to the correct occurrence.
const pieceStartOffsets = (fullText, pieces) => {
  const offsets = [];
  let from = 0;
  pieces.forEach((piece) => {
    const needle = piece.trim() || piece;
    let idx = fullText.indexOf(needle, from);
    if (idx < 0) idx = from;
    offsets.push(idx);
    from = idx + needle.length;
  });
  return offsets;
};

// OPT-IN splitter path: an arbitrary `text => string[]` segmenter. Reconstruct
// the monologue text, ask the splitter for boundaries, then assign every element
// to the last sentence whose start offset ≤ the element's offset — so no word is
// dropped in a whitespace gap. Sentence text/timing/confidence are rebuilt from
// the grouped elements (consistent with the default path).
const splitWithSegmenter = (elements, splitter) => {
  let fullText = '';
  const placed = elements.map((el) => {
    const charStart = fullText.length;
    fullText += el.value != null ? el.value : '';
    return { el, charStart };
  });
  const pieces = (splitter(fullText) || []).filter((p) => p && p.length);
  const starts = pieceStartOffsets(fullText, pieces);
  const buckets = (starts.length ? starts : [0]).map(() => ({ words: [], textParts: [] }));
  let bi = 0;
  placed.forEach(({ el, charStart }) => {
    while (bi + 1 < starts.length && starts[bi + 1] <= charStart) bi++;
    const bucket = buckets[Math.min(bi, buckets.length - 1)];
    const value = el.value != null ? el.value : '';
    if (el.type === 'text') bucket.words.push(wordFromElement(el));
    bucket.textParts.push(value);
  });
  return buckets.filter((b) => b.words.length > 0).map((b) => makeSentence(b.words, b.textParts));
};

/**
 * @param {object} revJson  rev.ai transcript ({ monologues:[{ speaker, elements }] }).
 * @param {object} [options]
 * @param {RegExp} [options.terminal=/[.!?…]/]  terminal-PUNCT matcher for the default split.
 * @param {(text:string)=>string[]} [options.splitter]  opt-in segmenter (e.g. sbd via ./split-sentences).
 * @returns {object|null}  sentence-level model, or null if `revJson` is not a rev.ai transcript.
 */
const buildSentenceModel = (revJson, options = {}) => {
  if (!isRevTranscript(revJson)) return null;
  const terminal = options.terminal || DEFAULT_TERMINAL;
  const splitter = typeof options.splitter === 'function' ? options.splitter : null;
  const monologues = revJson.monologues || [];

  const outMonologues = monologues.map((m) => ({
    speaker: m.speaker,
    sentences: splitter ? splitWithSegmenter(m.elements || [], splitter) : splitOnTerminalPunct(m.elements || [], terminal),
  }));

  const allWords = [];
  monologues.forEach((m) =>
    (m.elements || []).forEach((el) => {
      if (el.type === 'text') allWords.push(wordFromElement(el));
    })
  );

  const speakers = [...new Set(monologues.map((m) => m.speaker))].sort((a, b) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  );

  return {
    confidence_format: ['mean', 'duration_weighted'],
    speakers,
    sentence_count: outMonologues.reduce((sum, m) => sum + m.sentences.length, 0),
    word_count: allWords.length,
    duration_sec: allWords.length ? round(allWords[allWords.length - 1].end - allWords[0].start, 2) : 0,
    confidence: confidenceOf(allWords),
    monologues: outMonologues,
  };
};

/**
 * Group a paragraph's Slate words[] into runs that end on terminal punctuation —
 * the Slate-word analog of the rev.ai element walk above, so the terminal-split
 * rule lives in exactly one place. A sentence closes when a word's text ends with
 * a terminal char OR its `punctAfter` contains one.
 *
 * @param {Array<{text,start,end,confidence,punctAfter}>} words
 * @param {RegExp} [terminal=DEFAULT_TERMINAL]
 * @returns {Array<{wIdxStart:number, wIdxEnd:number, words:object[]}>}
 */
export const groupSlateWordsIntoSentences = (words, terminal = DEFAULT_TERMINAL) => {
  const list = Array.isArray(words) ? words : [];
  const out = [];
  let run = [];
  let startIdx = 0;
  list.forEach((w, i) => {
    run.push(w);
    const text = typeof w.text === 'string' ? w.text : '';
    const punctAfter = w.punctAfter || '';
    if (terminal.test(text.slice(-1)) || terminal.test(punctAfter)) {
      out.push({ wIdxStart: startIdx, wIdxEnd: i, words: run });
      run = [];
      startIdx = i + 1;
    }
  });
  if (run.length) out.push({ wIdxStart: startIdx, wIdxEnd: list.length - 1, words: run });
  return out;
};

export default buildSentenceModel;
