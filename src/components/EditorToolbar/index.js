import React, { useState } from 'react';
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
const DEV_EXPORTS = [
  { label: 'SlateJs (.json)', args: { type: 'json-slate', ext: 'json', speakers: true, timecodes: true } },
  { label: 'DPE (.json)', args: { type: 'json-digitalpaperedit', ext: 'json', speakers: true, timecodes: true } },
];

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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    rowGap: 6,
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
    border: `1px solid ${active ? C.text : C.line2}`,
    background: active ? C.soft : C.bg,
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
    border: `1px solid ${framed ? C.line2 : 'transparent'}`,
    background: framed ? C.bg : 'transparent',
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
    if (kind === 'primary') return { ...base, background: C.primary, color: C.primaryFg, border: `1px solid ${C.primary}` };
    if (kind === 'outline') return { ...base, background: C.bg, color: C.text, border: `1px solid ${C.line2}` };
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

// Word | Freestyle — the editing-mode switch (strict tiers only). Segmented pills.
const EDITING_MODE_LABELS = { word: 'Word', freestyle: 'Freestyle', paragraph: 'Paragraph' };
function EditingModeSwitch({ value, modes, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }} role="group" aria-label="Editing mode">
      {(modes || ['word', 'freestyle']).map((m) => (
        <button
          key={m}
          type="button"
          className="stte-hover-text"
          onClick={() => onChange && onChange(m)}
          aria-pressed={value === m}
          title={m === 'freestyle' ? 'Free-text editing — timestamps re-align on the original words' : 'Per-word seek, mute, and rewrite'}
          style={S.toggle(value === m)}
        >
          {EDITING_MODE_LABELS[m] || m}
        </button>
      ))}
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

  return (
    <div className="stte-ui stte-toolbar-scroll" style={S.bar}>
      <IconBtn
        icon={editable ? I.unlock : I.lock}
        title={editable ? 'Editing unlocked — click to lock' : 'Read-only — click to unlock'}
        framed
        active={!editable}
        onClick={() => setEditable(!editable)}
      />

      {showEditingModeSwitch && (
        <>
          <span style={S.divider} />
          <EditingModeSwitch value={editingMode} modes={editingModes} onChange={onEditingModeChange} />
        </>
      )}

      <span style={S.divider} />
      <span style={S.showLabel}>Show</span>
      <FlatToggle label="Speakers" active={display.showSpeakers} onClick={() => setDisplay('showSpeakers', !display.showSpeakers)} />
      <FlatToggle label="TC" active={display.showTimecodes} onClick={() => setDisplay('showTimecodes', !display.showTimecodes)} />
      <FlatToggle
        label="Annotations"
        active={display.showAnnotations}
        disabled={!canShowAnnotations}
        title={
          canShowAnnotations ? 'Show per-segment topic / mood / sentiment chips' : 'Segment annotations are only available for WhisperX transcripts'
        }
        onClick={() => setDisplay('showAnnotations', !display.showAnnotations)}
      />
      <FlatToggle label="Confidence" active={conf.overlay} onClick={() => setConf('overlay', !conf.overlay)} />

      {/* confidence sub-controls — always present (stable layout), dimmed when off */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          flex: '0 0 auto',
          opacity: conf.overlay ? 1 : 0.4,
          pointerEvents: conf.overlay ? 'auto' : 'none',
        }}
      >
        <select value={String(conf.cutoff)} onChange={(e) => setConf('cutoff', Number(e.target.value))} title="Confidence threshold" style={S.select}>
          {(cutoffOptions || [0.75, 0.8, 0.85]).map((v) => (
            <option key={v} value={String(v)}>{`≤ ${v.toFixed(2)}`}</option>
          ))}
        </select>
        <WordSentenceSwitch value={conf.level} onChange={(v) => setConf('level', v)} />
      </span>

      <span style={S.divider} />
      <IconBtn icon={I.undo} title="Undo" framed onClick={handleUndo} disabled={!editable} />
      <IconBtn icon={I.redo} title="Redo" framed onClick={handleRedo} disabled={!editable} />

      <span style={S.divider} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TextButton kind="outline" label="View" chevron />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>View presets</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={activePresetId || ''} onValueChange={(id) => actions.selectPreset(id)}>
            {(presets || []).map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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
      <TextButton kind="ghost" label="Revert" disabled={!editable} onClick={() => setRevertOpen(true)} />
      <TextButton kind="primary" icon={I.save} label="Save" disabled={!editable || !dirty || isProcessing} onClick={handleSave} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TextButton kind="outline" icon={I.export} label="Export" chevron />
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

      <IconBtn icon={I.prefs} title="Preferences" onClick={onOpenPreferences} />
      <IconBtn icon={I.info} title="How does this work?" onClick={() => setInfoOpen(true)} />

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
