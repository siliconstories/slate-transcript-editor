import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

// Multi-tab "How this editor works" lightbox — friendly, task-oriented help that covers the
// whole editor without diving into internals.
function Section({ heading, children }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1 font-bold text-primary">{heading}</div>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

// A little key-cap, e.g. <Kbd>⌘B</Kbd>.
function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-foreground">
      {children}
    </kbd>
  );
}

// One row of the Shortcuts cheat-sheet: key-cap(s) on the left, what it does on the right.
function ShortcutRow({ keys, children }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="flex shrink-0 gap-1" style={{ minWidth: 92 }}>
        {keys}
      </span>
      <span className="text-sm text-foreground/90">{children}</span>
    </div>
  );
}

const TABS = [
  { id: 'basics', label: 'Basics' },
  { id: 'editing', label: 'Editing' },
  { id: 'display', label: 'Display & confidence' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

export default function InfoDialog({ open, onOpenChange }) {
  const [tab, setTab] = useState('basics');
  // Modifier-key names follow the platform so the hints read right on macOS vs Windows/Linux.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const MOD = isMac ? '⌘' : 'Ctrl';
  const ALT = isMac ? '⌥' : 'Alt';
  const SHIFT = isMac ? '⇧' : 'Shift';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(820px,94vw)]">
        <DialogHeader>
          <DialogTitle>How this editor works</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="-mt-1 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 max-h-[64vh] overflow-y-auto pr-1">
          {tab === 'basics' && (
            <>
              <Section heading="What this is">
                A transcript editor — it edits an <em>existing</em> word-timed transcript (it doesn’t create one). Every word keeps its timecode, so
                you can clean up the text while staying in sync with the audio or video.
              </Section>
              <Section heading="Load">
                Open a media file (audio/video) <strong>and</strong> a matching transcript in rev.ai or WhisperX JSON. In this demo, use the
                <strong> Load &amp; options</strong> panel or pick one of the sample documents.
              </Section>
              <Section heading="Two ways to edit">
                Switch with <strong>Mode</strong> on the editing bar. <strong>Loose</strong> is free typing — edit the text however you like and
                timecodes re-align to the words. <strong>Strict (Word)</strong> keeps the word count fixed — you rewrite or mute one word at a time,
                which is safest when timing must stay exact. Click the lock to unlock editing.
              </Section>
              <Section heading="Play &amp; navigate">
                Play/pause, jump back/forward, and change speed under the video. “Follow playback” highlights the word being spoken. Hold{' '}
                <Kbd>{ALT}</Kbd> and click any word to play from there, and double-click a timecode to jump to it.
              </Section>
            </>
          )}

          {tab === 'editing' && (
            <>
              <Section heading="Select">
                Double-click a word to select it, or drag across several words to select a phrase — the same in both modes. The toolbar then acts on
                your selection.
              </Section>
              <Section heading="Change the words">
                In <strong>Loose</strong> mode just type to edit. In <strong>Strict</strong> mode, hold <Kbd>{MOD}</Kbd> and click a word to edit or
                mute it (muted words are dropped from exports) — the word count stays fixed.
              </Section>
              <Section heading="Format &amp; mark">
                With a selection, use <strong>B</strong> / <strong>I</strong> / <strong>U</strong>, <strong>Highlight</strong>, or{' '}
                <strong>Entity</strong> (to flag a name or place). <strong>Comment</strong> attaches a note: select, click Comment, and type — a 💬
                bubble appears in the text; click it to edit or delete. Each layer can be shown or hidden in the Display menu.
              </Section>
              <Section heading="Tools, undo &amp; save">
                The <strong>⋯ Tools</strong> menu can insert <em>[INAUDIBLE]</em>, a ♪ music note, or replace the whole text. Undo/redo with{' '}
                <Kbd>{MOD}Z</Kbd> /{' '}
                <Kbd>
                  {MOD}
                  {SHIFT}Z
                </Kbd>
                . <strong>Save</strong> often; <strong>Revert</strong> restores the last saved or the originally imported version.
              </Section>
              <Section heading="Get it out">
                <strong>Export</strong> to text, Word, captions (SRT/VTT…), or JSON. <strong>Raw (JSON)</strong> opens the underlying source to view
                or edit directly.
              </Section>
            </>
          )}

          {tab === 'display' && (
            <>
              <Section heading="Display menu">
                On the right of the editing bar, the <strong>Display</strong> menu shows or hides each layer — Speakers, Timecodes, Styling, Revised,
                Comments, Entity, Annotations — and <strong>All / None</strong> flips them together. The stack icon next to it switches saved{' '}
                <strong>Presets</strong> (handy view combinations).
              </Section>
              <Section heading="Confidence">
                <strong>Heat overlay</strong> tints low-confidence words so you can spot what to double-check — set the Word/Sentence level and the
                threshold. <strong>Sentence Status</strong> is the small gutter after each sentence: a confidence dot, an estimated-timing mark, and a
                one-click revert for that sentence.
              </Section>
              <Section heading="Tracked changes">
                Turn on <strong>Revised</strong> to see your edits against the original — edited words in amber, inserted in green, muted struck
                through. Fine-tune sizes, spacing, and confidence thresholds in <strong>Settings</strong>.
              </Section>
            </>
          )}

          {tab === 'shortcuts' && (
            <div className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-bold text-primary">Keyboard</div>
                <ShortcutRow keys={<Kbd>{MOD}B</Kbd>}>Bold the selection</ShortcutRow>
                <ShortcutRow keys={<Kbd>{MOD}I</Kbd>}>Italic</ShortcutRow>
                <ShortcutRow keys={<Kbd>{MOD}U</Kbd>}>Underline</ShortcutRow>
                <ShortcutRow keys={<Kbd>{MOD}Z</Kbd>}>Undo</ShortcutRow>
                <ShortcutRow
                  keys={
                    <Kbd>
                      {MOD}
                      {SHIFT}Z
                    </Kbd>
                  }
                >
                  Redo
                </ShortcutRow>
              </div>
              <div>
                <div className="mb-1 font-bold text-primary">Mouse &amp; gestures</div>
                <ShortcutRow keys={<span className="text-[11px] text-muted-foreground">double-click</span>}>Select a word</ShortcutRow>
                <ShortcutRow keys={<Kbd>{MOD}-click</Kbd>}>Edit a word (Strict mode)</ShortcutRow>
                <ShortcutRow keys={<Kbd>{ALT}-click</Kbd>}>Play from that word</ShortcutRow>
                <ShortcutRow keys={<span className="text-[11px] text-muted-foreground">dbl-click TC</span>}>Jump to a timecode</ShortcutRow>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
