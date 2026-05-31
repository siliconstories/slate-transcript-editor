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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,92vw)]">
        <DialogHeader>
          <DialogTitle>How this editor works</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <Section heading="Playing & seeking">
            Double-click a word or timecode to jump there. Alt/Option-click a word to play/pause from it. Seek back and forward with the round buttons
            under the monitor, and change playback speed. Optionally pause the media while typing (Preferences → Playback).
          </Section>
          <Section heading="Editing">
            Unlock editing with the lock button. Start typing to edit text; Ctrl/Cmd-click a word to mute it (muted words are removed from exports).
            Hit Enter between words to split a paragraph. Click a speaker to rename. Undo/redo with ⌘Z / ⌘⇧Z. Save regularly; Revert restores the last
            saved or the originally imported version.
          </Section>
          <Section heading="Confidence overlay">
            Low-confidence words are highlighted. Toggle Confidence in the toolbar, switch the Word/Sentence level, and set the threshold (≤ 0.75
            loose · 0.80 balanced · 0.85 strict — 0.85 ≈ the bottom ~15% of model confidence). Consecutive flagged words read as one continuous
            highlighter stroke. The View menu switches saved view presets.
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
