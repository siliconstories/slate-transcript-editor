/**
 * Adapters that convert the editor's Slate value to a human-facing export format.
 * The faithful transcript-JSON exports (rev.ai / WhisperX) are handled by the active
 * profile's own exporters, NOT here — this module covers plain text, Word (.docx),
 * subtitles, and the raw Slate value. It does no alignment, only format conversion.
 */
import slateToText from './txt';
import slateToDocx from '../export-adapters/docx';
import subtitlesExportOptionsList from './subtitles-generator/list';
import subtitlesGenerator from './subtitles-generator/index';

const captionTypeList = subtitlesExportOptionsList.map((list) => {
  return list.type;
});

export const isCaptionType = (type) => {
  const res = captionTypeList.includes(type);
  return res;
};

/**
 * Flatten the Slate value into the `{ words, paragraphs }` shape the subtitle
 * generator consumes — walking each paragraph's leaf `words[]` directly (each word
 * carries start/end/text/speaker), so no DPE round-trip is needed. Muted/empty words
 * have already been stripped by the caller (stripMutedWords) before export.
 */
const slateToWordsAndParagraphs = (slateValue) => {
  const words = [];
  const paragraphs = [];
  (slateValue || []).forEach((paragraph) => {
    const leafWords = (paragraph.children && paragraph.children[0] && paragraph.children[0].words) || [];
    const live = leafWords.filter((w) => typeof w.text === 'string' && w.text.length > 0);
    if (live.length === 0) return;
    const start = typeof paragraph.start === 'number' ? paragraph.start : live[0].start;
    live.forEach((w) => {
      words.push({ start: w.start, end: w.end, text: w.text, ...(w.speaker != null ? { speaker: w.speaker } : {}) });
    });
    paragraphs.push({ start, end: live[live.length - 1].end, speaker: paragraph.speaker });
  });
  return { words, paragraphs };
};

const exportAdapter = ({ slateValue, type, ext, transcriptTitle, speakers, timecodes, inlineTimecodes, hideTitle, atlasFormat }) => {
  switch (type) {
    case 'text':
      return slateToText({ value: slateValue, speakers, timecodes, atlasFormat });
    case 'json-slate':
      return slateValue;
    case 'word':
      return slateToDocx({
        title: transcriptTitle,
        value: slateValue,
        speakers,
        timecodes,
        inlineTimecodes,
        hideTitle,
      });
    default:
      if (isCaptionType(type)) {
        const { words, paragraphs } = slateToWordsAndParagraphs(slateValue);
        const subtitlesJson = subtitlesGenerator({
          words,
          paragraphs,
          type,
          slateValue,
        });
        return subtitlesJson;
      }
      // some default, unlikely to be called
      console.error('Did not recognise the export format ', type);
      return 'Did not recognise the export format';
  }
};

export default exportAdapter;
