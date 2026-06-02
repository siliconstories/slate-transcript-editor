/**
 * Project the unified immutable model to the editor's Slate value, dispatching on
 * `model.format`. rev.ai projects DIRECTLY via `revModelToSlate` (no DPE round-trip);
 * WhisperX projects one-paragraph-per-segment via `whisperxModelToSlate`. Both yield
 * the same paragraph shape:
 *   { type:'timedText', speaker, start, previousTimings, startTimecode, [annotations],
 *     children:[{ text:'<words joined by space>', words:[ word objs ] }] }
 * so everything downstream (overlay, freetext, decorations, edit-gating) is identical.
 */
import { revModelToSlate } from './rev-to-slate';
import { whisperxModelToSlate } from './whisperx-to-slate';

export const whisperModelToSlate = (model, history) =>
  model.format === 'whisperx' ? whisperxModelToSlate(model, history) : revModelToSlate(model, history);

export default whisperModelToSlate;
