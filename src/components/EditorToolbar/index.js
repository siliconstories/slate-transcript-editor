import React, { useState, useRef, useEffect } from 'react';
import subtitlesExportOptionsList from '../../util/export-adapters/subtitles-generator/list.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import InfoDialog from '../InfoDialog';
import { I } from '../ui/icons';

const TEXT_EXPORTS = [
  { label: 'Text (.txt)', args: { type: 'text', ext: 'txt', speakers: false, timecodes: false } },
  { label: 'Text (Speakers)', args: { type: 'text', ext: 'txt', speakers: true, timecodes: false } },
  { label: 'Text (Timecodes)', args: { type: 'text', ext: 'txt', speakers: false, timecodes: true } },
  { label: 'Text (Speakers & Timecodes)', args: { type: 'text', ext: 'txt', speakers: true, timecodes: true } },
  { label: 'Text (Atlas)', args: { type: 'text', ext: 'txt', speakers: true, timecodes: true, atlasFormat: true } },
];
const WORD_EXPORTS = [
  { label: 'Word (.docx)', args: { type: 'word', ext: 'docx', speakers: false, timecodes: false } },
  { label: 'Word (Speakers)', args: { type: 'word', ext: 'docx', speakers: true, timecodes: false } },
  { label: 'Word (Timecodes)', args: { type: 'word', ext: 'docx', speakers: false, timecodes: true } },
  { label: 'Word (Speakers & Timecodes)', args: { type: 'word', ext: 'docx', speakers: true, timecodes: true } },
  { label: 'Word (OHMS)', args: { type: 'word', ext: 'docx', speakers: false, timecodes: false, inlineTimecodes: true, hideTitle: true } },
];
const DEV_EXPORTS = [{ label: 'SlateJs (.json)', args: { type: 'json-slate', ext: 'json', speakers: true, timecodes: true } }];

// ── Hairline palette (the chosen look) ──
const C = {
  text: '#18181b',
  muted: '#71717a',
  faint: '#a1a1aa',
  line: '#e4e4e7',
  line2: '#d4d4d8',
  bg: '#ffffff',
  soft: '#f4f4f5',
  primary: '#18181b',
  primaryFg: '#ffffff',
};

const S = {
  bar: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderBottom: `1px solid ${C.line}`,
    background: C.bg,
    fontFamily: 'Inter, Roboto, system-ui, sans-serif',
    color: C.text,
  },
  showLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint, flex: '0 0 auto' },
  divider: { width: 1, height: 18, background: C.line, margin: '0 5px', flex: '0 0 auto' },
  spring: { flex: 1, minWidth: 8 },
  toggle: (active) => ({
    cursor: 'pointer',
    border: '1px solid transparent',
    background: active ? C.soft : 'transparent',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    color: active ? C.text : C.muted,
    fontWeight: active ? 600 : 400,
    flex: '0 0 auto',
  }),
  iconBtn: (framed) => ({
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid transparent',
    background: framed ? C.soft : 'transparent',
    color: C.muted,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  }),
  textBtn: (kind) => {
    const base = {
      height: 28,
      padding: '0 10px',
      borderRadius: 6,
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      whiteSpace: 'nowrap',
      flex: '0 0 auto',
    };
    if (kind === 'primary') return { ...base, background: C.primary, color: C.primaryFg, border: '1px solid transparent' };
    if (kind === 'outline') return { ...base, background: 'transparent', color: C.text, border: '1px solid transparent' };
    return { ...base, background: 'transparent', color: C.muted, border: '1px solid transparent' }; // ghost
  },
  select: {
    height: 24,
    fontSize: 12,
    fontFamily: 'inherit',
    color: C.muted,
    border: 'none',
    background: 'transparent',
    padding: '0 2px',
    cursor: 'pointer',
    WebkitAppearance: 'none',
    appearance: 'none',
    outline: 'none',
    flex: '0 0 auto',
  },
  popover: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    background: C.bg,
    border: `1px solid ${C.line2}`,
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: 12,
    zIndex: 50,
    minWidth: 248,
    display: 'flex',
    flexDirection: 'column',
  },
  popLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint, marginBottom: 6 },
  groupGap: { width: 12, flex: '0 0 auto' }, // breathing room between logical toolbar groups (no divider line)
};

function FlatToggle({ label, active, onClick, disabled, title }) {
  return (
    <button
      type="button"
      className="stte-hover-text"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{ ...S.toggle(active && !disabled), ...(disabled ? { opacity: 0.4, cursor: 'default' } : null) }}
    >
      {label}
    </button>
  );
}

const IconBtn = React.forwardRef(({ icon: Icon, title, framed, active, onClick, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    className="stte-hover-soft"
    title={title}
    onClick={onClick}
    disabled={disabled}
    style={{ ...S.iconBtn(framed), ...(active ? { color: C.text } : null), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
    {...rest}
  >
    <Icon size={20} />
  </button>
));
IconBtn.displayName = 'IconBtn';

const TextButton = React.forwardRef(({ kind = 'ghost', icon: Icon, label, chevron, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    className={kind === 'ghost' ? 'stte-hover-soft' : 'stte-hover-btn'}
    disabled={disabled}
    style={{ ...S.textBtn(kind), opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }}
    {...rest}
  >
    {Icon && <Icon size={19} style={{ opacity: 0.85 }} />}
    {label}
    {chevron && <I.chevron size={16} style={{ opacity: 0.55 }} />}
  </button>
));
TextButton.displayName = 'TextButton';

// Word / Sentence — bare text + slash (Hairline). Active = foreground/600.
function WordSentenceSwitch({ value, onChange }) {
  const opt = (v, label) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        padding: 0,
        color: value === v ? C.text : C.faint,
        fontWeight: value === v ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
      {opt('word', 'Word')}
      <span style={{ color: C.line2 }}>/</span>
      {opt('sentence', 'Sentence')}
    </span>
  );
}

// Editing-mode switch: "Mode:" + Strict | Loose pills. Both modes share the same
// Slate surface, data model, display options, and keyboard navigation — they differ
// ONLY in double-click: 'word' ("Strict") selects one word for single-word edit/mute
// on a read-only surface; 'freestyle' ("Loose") is free-text editing with re-aligned
// timestamps.
const EDITING_MODE_LABELS = { word: 'Strict', freestyle: 'Loose', paragraph: 'Paragraph' };
const EDITING_MODE_TITLES = {
  word: 'Strict — double-click a word to edit or mute it (word count fixed)',
  freestyle: 'Loose — free-text editing; timestamps re-align on the original words',
};
function EditingModeSwitch({ value, modes, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }} role="group" aria-label="Editing mode">
      <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' }}>Mode:</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {(modes || ['word', 'freestyle']).map((m) => (
          <button
            key={m}
            type="button"
            className="stte-hover-text"
            onClick={() => onChange && onChange(m)}
            aria-pressed={value === m}
            title={EDITING_MODE_TITLES[m] || ''}
            style={S.toggle(value === m)}
          >
            {EDITING_MODE_LABELS[m] || m}
          </button>
        ))}
      </span>
    </span>
  );
}

// User-styling buttons: bold / italic / underline / highlight, applied to the current
// selection (one word in Strict, an arbitrary range in Loose). Shared by both modes.
function StyleGroup({ enabled, onApply }) {
  const base = {
    border: '1px solid transparent',
    borderRadius: 4,
    background: 'transparent',
    minWidth: 22,
    height: 22,
    fontSize: 12,
    lineHeight: 1,
    padding: '0 4px',
  };
  const btn = (label, mark, extra, title) => (
    <button
      type="button"
      disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onApply(mark)}
      title={title}
      style={{ ...base, ...extra, opacity: enabled ? 1 : 0.4, cursor: enabled ? 'pointer' : 'default' }}
    >
      {label}
    </button>
  );
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }} title="Apply styling to the selection">
      {btn('B', 'bold', { fontWeight: 700 }, 'Bold (⌘B)')}
      {btn('I', 'italic', { fontStyle: 'italic' }, 'Italic (⌘I)')}
      {btn('U', 'underline', { textDecoration: 'underline' }, 'Underline (⌘U)')}
      {btn('H', { highlight: '#fde68a' }, { background: '#fde68a' }, 'Highlight')}
    </span>
  );
}

// Anchored "Display" popover: the Show toggles + confidence sub-controls, lifted
// off the toolbar to keep it on one line. Self-contained (open state + click-outside).
function DisplayPopover({ display, conf, cutoffOptions, canShowAnnotations, setDisplay, setConf }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <TextButton kind="outline" label="Display" chevron onClick={() => setOpen((o) => !o)} aria-expanded={open} />
      {open && (
        <div className="stte-ui" style={S.popover} role="dialog" aria-label="Display options">
          <div style={S.popLabel}>Show</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <FlatToggle label="Speakers" active={display.showSpeakers} onClick={() => setDisplay('showSpeakers', !display.showSpeakers)} />
            <FlatToggle label="Timecodes" active={display.showTimecodes} onClick={() => setDisplay('showTimecodes', !display.showTimecodes)} />
            <FlatToggle
              label="Annotations"
              active={display.showAnnotations}
              disabled={!canShowAnnotations}
              title={
                canShowAnnotations
                  ? 'Show per-segment topic / mood / sentiment chips'
                  : 'Segment annotations are only available for WhisperX transcripts'
              }
              onClick={() => setDisplay('showAnnotations', !display.showAnnotations)}
            />
            <FlatToggle label="Confidence" active={conf.overlay} onClick={() => setConf('overlay', !conf.overlay)} />
            <FlatToggle
              label="Styling"
              active={display.showStyling !== false}
              title="Show user styling (bold / italic / underline / highlight / notes)"
              onClick={() => setDisplay('showStyling', !(display.showStyling !== false))}
            />
          </div>
          <div style={{ ...S.popLabel, marginTop: 12, opacity: conf.overlay ? 1 : 0.4 }}>Confidence heat</div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: conf.overlay ? 1 : 0.4, pointerEvents: conf.overlay ? 'auto' : 'none' }}
          >
            <select
              value={String(conf.cutoff)}
              onChange={(e) => setConf('cutoff', Number(e.target.value))}
              title="Word confidence threshold (sentence offset is in Preferences → Confidence)"
              style={{ ...S.select, color: C.text }}
            >
              {(cutoffOptions || [0.75, 0.8, 0.85]).map((v) => (
                <option key={v} value={String(v)}>{`≤ ${v.toFixed(2)}`}</option>
              ))}
            </select>
            <WordSentenceSwitch value={conf.level} onChange={(v) => setConf('level', v)} />
          </div>
        </div>
      )}
    </span>
  );
}

export default function EditorToolbar({
  editable,
  setEditable,
  settings,
  actions,
  presets,
  activePresetId,
  canStructuralEdit,
  canShowAnnotations,
  cutoffOptions,
  editingMode,
  editingModes,
  onEditingModeChange,
  showEditingModeSwitch,
  canStyle,
  styleEnabled,
  onApplyStyle,
  isProcessing,
  isContentSaved,
  handleSave,
  handleUndo,
  handleRedo,
  handleExport,
  exporters,
  onRevertToSaved,
  onRevertToImported,
  handleReplaceText,
  insertTextInaudible,
  handleInsertMusicNote,
  onOpenPreferences,
  onShowRawSource,
}) {
  const [revertOpen, setRevertOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const display = settings.display;
  const conf = settings.confidence;
  const setDisplay = (key, val) => actions.setField('display', key, val);
  const setConf = (key, val) => actions.setField('confidence', key, val);

  const dirty = !isContentSaved;
  const runExport = (args) => handleExport({ ...args, isDownload: true });
  const activePreset = (presets || []).find((p) => p.id === activePresetId);

  return (
    <div className="stte-ui stte-toolbar-scroll" style={S.bar}>
      <IconBtn
        icon={editable ? I.unlock : I.lock}
        title={editable ? 'Editing unlocked — click to lock' : 'Read-only — click to unlock'}
        framed
        active={!editable}
        onClick={() => setEditable(!editable)}
      />

      {showEditingModeSwitch && <EditingModeSwitch value={editingMode} modes={editingModes} onChange={onEditingModeChange} />}

      {canStyle && editable && <StyleGroup enabled={styleEnabled} onApply={onApplyStyle} />}

      <span style={S.groupGap} />
      <DisplayPopover
        display={display}
        conf={conf}
        cutoffOptions={cutoffOptions}
        canShowAnnotations={canShowAnnotations}
        setDisplay={setDisplay}
        setConf={setConf}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TextButton
            kind="outline"
            label="Presets"
            chevron
            title={activePreset ? `Display presets — current: ${activePreset.name}` : 'Display presets'}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Display presets</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={activePresetId || ''} onValueChange={(id) => actions.selectPreset(id)}>
            {(presets || []).map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <span style={S.groupGap} />
      <IconBtn icon={I.undo} title="Undo (⌘Z)" framed onClick={handleUndo} disabled={!editable} />
      <IconBtn icon={I.redo} title="Redo (⌘Y)" framed onClick={handleRedo} disabled={!editable} />

      <span style={S.groupGap} />

      {canStructuralEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconBtn icon={I.tools} title="Tools" disabled={!editable} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Tools</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => insertTextInaudible && insertTextInaudible()}>
              <I.inaudible /> Insert [INAUDIBLE]
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleInsertMusicNote && handleInsertMusicNote()}>
              <I.music /> Insert ♪ music note
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleReplaceText && handleReplaceText()}>
              <I.replace /> Replace whole text…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span style={S.spring} />

      {onShowRawSource && <TextButton kind="ghost" label="Raw…" onClick={() => onShowRawSource()} />}
      <TextButton kind="ghost" label="Settings" onClick={onOpenPreferences} />
      <TextButton kind="ghost" label="Help" onClick={() => setInfoOpen(true)} />
      <span style={S.groupGap} />
      <TextButton kind="primary" label="Save" disabled={!editable || !dirty || isProcessing} onClick={handleSave} />
      <TextButton kind="ghost" label="Revert" disabled={!editable} onClick={() => setRevertOpen(true)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TextButton kind="outline" label="Export" chevron />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
          <DropdownMenuLabel>Text</DropdownMenuLabel>
          {TEXT_EXPORTS.map((e) => (
            <DropdownMenuItem key={e.label} onSelect={() => runExport(e.args)}>
              {e.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Word</DropdownMenuLabel>
          {WORD_EXPORTS.map((e) => (
            <DropdownMenuItem key={e.label} onSelect={() => runExport(e.args)}>
              {e.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Captions</DropdownMenuLabel>
          {subtitlesExportOptionsList.map(({ type, label, ext }) => (
            <DropdownMenuItem key={`${type}-${ext}`} onSelect={() => runExport({ type, ext })}>
              {label} (.{ext})
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Developer</DropdownMenuLabel>
          {DEV_EXPORTS.map((e) => (
            <DropdownMenuItem key={e.label} onSelect={() => runExport(e.args)}>
              {e.label}
            </DropdownMenuItem>
          ))}
          {exporters && exporters.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>rev.ai</DropdownMenuLabel>
              {exporters.map(({ id, label, ext }) => (
                <DropdownMenuItem key={id} onSelect={() => runExport({ type: id, ext })}>
                  {label} (.{ext})
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
        <DialogContent className="w-[min(440px,92vw)]">
          <DialogHeader>
            <DialogTitle>Revert to…</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="stte-hover-btn"
              style={S.textBtn('outline')}
              onClick={() => {
                onRevertToSaved();
                setRevertOpen(false);
              }}
            >
              Revert to last saved version
            </button>
            <button
              type="button"
              className="stte-hover-btn"
              style={S.textBtn('outline')}
              onClick={() => {
                onRevertToImported();
                setRevertOpen(false);
              }}
            >
              Revert to imported version
            </button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="stte-hover-soft" style={S.textBtn('ghost')}>
                Cancel
              </button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}
