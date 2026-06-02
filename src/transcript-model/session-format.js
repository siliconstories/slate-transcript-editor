/**
 * The re-importable "editing session" format. Faithful rev.ai/WhisperX JSON cannot
 * carry user styling (it is not part of the ASR schema), so the full editable state —
 * the frozen source `original` plus the entire overlay (word rewrites, mutes, freetext
 * paragraphs, AND user styles) — is saved in this envelope. Re-importing it restores
 * the editor to exactly where it was saved.
 *
 *   { format:'ste-session/v1', sourceFormat:'revai'|'whisperx', original:<source JSON>, overlay:{...} }
 *
 * Detection must run BEFORE rev.ai/WhisperX detection, because `original` is itself a
 * rev.ai/WhisperX document and would otherwise be mis-detected as a fresh import.
 */
export const SESSION_FORMAT = 'ste-session/v1';

export const isSessionFile = (parsed) =>
  Boolean(parsed && typeof parsed === 'object' && parsed.format === SESSION_FORMAT && parsed.original && typeof parsed.overlay === 'object');

export default { SESSION_FORMAT, isSessionFile };
