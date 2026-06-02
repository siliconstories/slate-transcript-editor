import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

// Consolidated "How this editor works" overlay — gathers the explanatory copy that
// used to be scattered across tooltips, the replace-text prompt, and the confidence help.
function Section({ heading, children }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1 font-bold text-primary">{heading}</div>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

export default function InfoDialog({ open, onOpenChange }) {
  // Modifier-key names follow the platform so the hints read right on macOS vs Windows/Linux.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const MOD = isMac ? '⌘' : 'Ctrl';
  const ALT = isMac ? '⌥ Option' : 'Alt';
  const SHIFT = isMac ? '⇧' : 'Shift';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,92vw)]">
        <DialogHeader>
          <DialogTitle>How this editor works</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <Section heading="Playing & seeking">
            Double-click a timecode to jump there. {ALT}-click a word to play/pause from it. Seek back and forward with the round buttons under the
            monitor, and change playback speed. Optionally pause the media while typing (Preferences → Playback).
          </Section>
          <Section heading="Selecting & formatting">
            Double-click a word to select it — or drag to select a phrase — then format from the toolbar: Bold ({MOD}B), Italic ({MOD}I), Underline (
            {MOD}U), Highlight, and Entity. Select a span and click Comment to attach a note; click a comment bubble to edit or delete it. Show or
            hide each layer in the Display menu.
          </Section>
          <Section heading="Editing words">
            Unlock editing with the lock button. In <strong>Word (Strict)</strong> mode the word count stays fixed — {MOD}-click a word to edit or
            mute it (muted words are removed from exports). In <strong>Loose</strong> mode, just type to edit the text and the timecodes re-align; hit
            Enter between words to split a paragraph. Click a speaker to rename. Undo/redo with {MOD}Z / {MOD}
            {SHIFT}Z. Save regularly; Revert restores the last saved or the originally imported version.
          </Section>
          <Section heading="Confidence & sentence status">
            Low-confidence words are washed in colour (Display → Heat overlay); switch the Word/Sentence level and the threshold (≤ 0.75 loose · 0.80
            balanced · 0.85 strict). The per-sentence gutter (Display → Sentence Status) shows a confidence dot, an estimated-timing mark, and a
            revert button for each sentence. The Presets icon switches saved view presets.
          </Section>
          <Section heading="Tools">
            The ⋯ Tools menu (editable, free-text transcripts) lets you insert [INAUDIBLE], a ♪ music note, or replace the whole text with an accurate
            transcription to restore timecodes against it.
          </Section>
          <Section heading="Export">
            Text (plain / speakers / timecodes / Atlas), Word .docx (+ speakers / timecodes / OHMS), Captions (SRT / VTT / iTT / TTML…), developer
            JSON (Slate / DPE), and — for rev.ai transcripts — the faithful and sentence-level exports.
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
