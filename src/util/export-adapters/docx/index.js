import { Document, Paragraph, TextRun, Packer, HeadingLevel, AlignmentType, Tab } from 'docx';
import { shortTimecode } from '../../timecode-converter/';
import { Node } from 'slate';
export default slateToDocx;

// Builds the docx Document model from a Slate value. Pure + DOM-free so it can be
// snapshot-tested headlessly (Packer.toBuffer) — see ./index.test.js. The browser
// download lives in downloadDocx below. Mirrors the structure of the original
// docx 4.7.1 exporter (Heading1+center title, a bold speaker run with a leading
// tab when timecodes are shown, one break after each body paragraph) on docx 9's
// declarative sections/children API.
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
  const paragraphs = [];

  if (!hideTitle) {
    // Transcript Title
    paragraphs.push(
      new Paragraph({
        children: [new TextRun(title)],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      })
    );
    // add spacing
    paragraphs.push(new Paragraph({}));
  }

  value.forEach((slateParagraph) => {
    const headerChildren = [];
    if (timecodes) {
      headerChildren.push(new TextRun(shortTimecode(slateParagraph.start)));
    }
    if (speakers) {
      if (timecodes) {
        // tab before the speaker name, both inside the bold run (as in docx 4.7.1)
        headerChildren.push(new TextRun({ bold: true, children: [new Tab(), slateParagraph.speaker] }));
      } else {
        headerChildren.push(new TextRun({ text: slateParagraph.speaker, bold: true }));
      }
    }

    const paragraphContents = Node.string(slateParagraph);

    if (inlineTimecodes) {
      headerChildren.push(new TextRun(`${slateParagraph.speaker.toUpperCase()}:  ${paragraphContents}`));
    }

    if (timecodes || speakers || inlineTimecodes) {
      paragraphs.push(new Paragraph({ children: headerChildren }));
      paragraphs.push(new Paragraph({}));
    }

    if (!inlineTimecodes) {
      paragraphs.push(new Paragraph({ children: [new TextRun(paragraphContents), new TextRun({ break: 1 })] }));
    }
  });

  return new Document({
    creator: creator,
    description: description,
    title: title,
    sections: [{ children: paragraphs }],
  });
}

// Browser side-effect: pack the document to a blob and trigger a download.
export function downloadDocx(doc, title = 'Transcript') {
  return Packer.toBlob(doc).then((blob) => {
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
