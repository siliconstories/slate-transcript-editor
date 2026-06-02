/**
 * Paragraph-level diff-anchoring for the Freestyle editing mode (framework-free).
 *
 * When a paragraph is edited as free text, we must decide which ORIGINAL words
 * survived (so they keep their exact timestamp + their model anchor, and export
 * byte-faithfully) and which words are NEW (so they get interpolated timing,
 * flagged `estimated`). `stt-align-node`'s `alignSTT` cannot do this — it strips
 * its output to `{start,end,text}` and discards which original word each token
 * matched. So we diff directly with `difflib.SequenceMatcher`, whose opcodes give
 * us the survivor map: an `equal` opcode means edited token b[j] IS original word
 * a[i], so we carry that word's `start/end/confidence/anchor` through verbatim.
 *
 * Matching is done on a NORMALISED form (lowercased, punctuation-stripped,
 * numbers→words via stt-align-node's `normaliseWord`) so capitalisation and
 * punctuation edits still count as the same word; the user's RAW spelling is
 * always what gets emitted as the token value.
 */
import difflib from 'difflib';
import normaliseWord from 'stt-align-node/utils/normalise-word';

/** Whitespace-split that mirrors how the leaf `text` is space-joined. */
export const splitOnWhiteSpaces = (text) =>
  String(text == null ? '' : text)
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const firstStart = (words) => {
  for (const w of words) if (isNum(w.start)) return w.start;
  return 0;
};
const lastEnd = (words) => {
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (isNum(words[i].end)) return words[i].end;
    if (isNum(words[i].start)) return words[i].start;
  }
  return firstStart(words);
};

/**
 * Fill the timing of every `estimated` token, in place, so the whole list stays
 * monotonically non-decreasing. Each maximal run of estimated tokens is spread
 * evenly between the previous survivor's `end` and the next survivor's `start`
 * (falling back to the paragraph bounds at the head/tail, or when a neighbouring
 * survivor is itself untimed). A degenerate interval (`left >= right`) collapses
 * the run to a zero-width point at `left` rather than emitting decreasing times.
 */
export const interpolateEstimated = (tokens, paraStart, paraEnd) => {
  const n = tokens.length;
  const pStart = isNum(paraStart) ? paraStart : 0;
  const pEnd = isNum(paraEnd) ? paraEnd : pStart;

  const leftBound = (runStart) => {
    for (let k = runStart - 1; k >= 0; k -= 1) if (isNum(tokens[k].end)) return tokens[k].end;
    return pStart;
  };
  const rightBound = (runEnd) => {
    for (let k = runEnd; k < n; k += 1) if (isNum(tokens[k].start)) return tokens[k].start;
    return pEnd;
  };

  let i = 0;
  while (i < n) {
    if (!tokens[i].estimated) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && tokens[j].estimated) j += 1;
    const left = leftBound(i);
    const right = rightBound(j);
    const count = j - i;
    if (right <= left) {
      for (let k = i; k < j; k += 1) {
        tokens[k].start = left;
        tokens[k].end = left;
      }
    } else {
      const step = (right - left) / count;
      for (let k = 0; k < count; k += 1) {
        tokens[i + k].start = left + step * k;
        tokens[i + k].end = left + step * (k + 1);
      }
    }
    i = j;
  }
  return tokens;
};

/**
 * Diff `editedText` against a paragraph's original model words and return the
 * aligned token list (in edited reading order). Survivors keep their exact
 * timing/confidence + their `ref` anchor; inserted words are timed by
 * interpolation and flagged `estimated`.
 *
 * @param {Array<{key:string,value:string,start:?number,end:?number,confidence:?number}>} originalWords
 * @param {string} editedText
 * @returns {Array<{ref:?string,value:string,start:number,end:number,confidence:?number,estimated:boolean}>}
 */
export const alignParagraph = (originalWords, editedText) => {
  const words = Array.isArray(originalWords) ? originalWords : [];
  const editedTokens = splitOnWhiteSpaces(editedText);
  if (editedTokens.length === 0) return [];

  const a = words.map((w) => normaliseWord(w.value) || '');
  const b = editedTokens.map((t) => normaliseWord(t) || '');
  const matcher = new difflib.SequenceMatcher(null, a, b);

  const tokens = [];
  matcher.getOpcodes().forEach(([tag, i1, i2, j1, j2]) => {
    if (tag === 'equal') {
      for (let d = 0; d < i2 - i1; d += 1) {
        const ow = words[i1 + d];
        tokens.push({
          ref: ow.key,
          value: editedTokens[j1 + d],
          start: isNum(ow.start) ? ow.start : null,
          end: isNum(ow.end) ? ow.end : null,
          confidence: typeof ow.confidence === 'number' ? ow.confidence : null,
          estimated: false,
        });
      }
    } else if (tag === 'replace' || tag === 'insert') {
      for (let j = j1; j < j2; j += 1) {
        tokens.push({ ref: null, value: editedTokens[j], start: null, end: null, confidence: null, estimated: true });
      }
    }
    // 'delete' => original words a[i1..i2) dropped: emit nothing.
  });

  return interpolateEstimated(tokens, firstStart(words), lastEnd(words));
};

export default { alignParagraph, interpolateEstimated, splitOnWhiteSpaces };
