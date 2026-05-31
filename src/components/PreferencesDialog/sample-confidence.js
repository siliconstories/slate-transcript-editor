/**
 * Synthetic sample paragraph for the Confidence-tab live preview. A spread of
 * confidence values (0.47–0.99) and a couple of sentence breaks so both the
 * word- and sentence-level previews read clearly. Preview-only (not real data).
 */
const PREVIEW_WORDS = [
  { text: 'The', confidence: 0.99, start: 0.0, end: 0.2 },
  { text: 'interview', confidence: 0.74, start: 0.2, end: 0.6 },
  { text: 'was', confidence: 0.95, start: 0.6, end: 0.8 },
  { text: 'recorded', confidence: 0.58, start: 0.8, end: 1.2 },
  { text: 'in', confidence: 0.97, start: 1.2, end: 1.3 },
  { text: 'a', confidence: 0.9, start: 1.3, end: 1.4 },
  { text: 'noisy', confidence: 0.47, start: 1.4, end: 1.8 },
  { text: 'cafe', confidence: 0.52, start: 1.8, end: 2.2, punctAfter: '.' },
  { text: 'Some', confidence: 0.88, start: 2.2, end: 2.5 },
  { text: 'words', confidence: 0.69, start: 2.5, end: 2.8 },
  { text: 'are', confidence: 0.93, start: 2.8, end: 3.0 },
  { text: 'crystal', confidence: 0.98, start: 3.0, end: 3.4 },
  { text: 'clear', confidence: 0.96, start: 3.4, end: 3.7, punctAfter: ',' },
  { text: 'others', confidence: 0.61, start: 3.7, end: 4.0 },
  { text: 'much', confidence: 0.8, start: 4.0, end: 4.2 },
  { text: 'less', confidence: 0.55, start: 4.2, end: 4.5 },
  { text: 'so', confidence: 0.5, start: 4.5, end: 4.7, punctAfter: '.' },
];

export default PREVIEW_WORDS;
