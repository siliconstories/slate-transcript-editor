import { Document, Paragraph, TextRun, Packer } from 'docx';
import { shortTimecode } from '../../timecode-converter/';
import { Node } from 'slate';
export default slateToDocx;

// Builds the docx Document model from a Slate value. Pure + DOM-free so it can be
// snapshot-tested headlessly (Packer.toBuffer) — the golden baseline the docx 9
// rewrite is diffed against. The browser download lives in downloadDocx below.
export function buildDocxDocument({
  value,
  speakers,
  timecodes,
  inlineTimecodes,
  hideTitle,
  title = 'Transcript',
  creator = 'Slate Transcript Editor',
  description = 'Transcript',
}) {
  const doc = new Document({
    creator: creator,
    description: description,
    title: title,
  });

  if (!hideTitle) {
    // Transcript Title
    const textTitle = new TextRun(title);
    const paragraphTitle = new Paragraph();
    paragraphTitle.addRun(textTitle);
    paragraphTitle.heading1().center();
    doc.addParagraph(paragraphTitle);

    // add spacing
    var paragraphEmpty = new Paragraph();
    doc.addParagraph(paragraphEmpty);
  }

  value.forEach((slateParagraph) => {
    // TODO: use timecode converter module to convert from seconds to timecode

    const paragraphSpeakerTimecodes = new Paragraph();
    if (timecodes) {
      const timecodeStartTime = new TextRun(shortTimecode(slateParagraph.start));
      paragraphSpeakerTimecodes.addRun(timecodeStartTime);
    }
    if (speakers) {
      if (timecodes) {
        const speaker = new TextRun(slateParagraph.speaker).bold().tab();
        paragraphSpeakerTimecodes.addRun(speaker);
      } else {
        const speaker = new TextRun(slateParagraph.speaker).bold();
        paragraphSpeakerTimecodes.addRun(speaker);
      }
    }

    const paragraphContents = Node.string(slateParagraph);
    const textBreak = new TextRun('').break();

    if (inlineTimecodes) {
      paragraphSpeakerTimecodes.addRun(new TextRun(`${slateParagraph.speaker.toUpperCase()}:  ${paragraphContents}`));
    }

    if (timecodes || speakers || inlineTimecodes) {
      doc.addParagraph(paragraphSpeakerTimecodes);
      doc.addParagraph(new Paragraph());
    }

    if (!inlineTimecodes) {
      const paragraphText = new Paragraph(paragraphContents);
      paragraphText.addRun(textBreak);
      doc.addParagraph(paragraphText);
    }
  });

  return doc;
}

// Browser side-effect: pack the document to a blob and trigger a download.
export function downloadDocx(doc, title = 'Transcript') {
  const packer = new Packer();

  return packer.toBlob(doc).then((blob) => {
    const filename = `${title}.docx`;
    // // const type =  'application/octet-stream';
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    return blob;
  });
}

function slateToDocx(opts) {
  const doc = buildDocxDocument(opts);
  return downloadDocx(doc, opts.title);
}
