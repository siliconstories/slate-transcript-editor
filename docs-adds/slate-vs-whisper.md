Slate and WhisperX disagree about one thing, and that disagreement is the whole problem: **Slate's atomic unit is a text node whose identity is its formatting, while WhisperX's atomic unit is a word whose identity is its timing.** Slate's normalizer actively merges adjacent text nodes that share marks and splits them when marks diverge — which is precisely the operation that destroys a stable word↔timestamp mapping. Every viable architecture is really a different answer to _where timing lives relative to where styling lives_.

The invariant I'd design around, given your "keep ALL whisper data intact" goal: **treat the WhisperX import as a frozen, immutable base, and treat every edit — text correction, deletion, reordering, speaker reassignment, and styling — as an additive layer on top, never an in-place mutation.** If you overwrite a leaf's `.text` when fixing "there"→"their", you've silently lost raw ASR output; archival fidelity (cineMINDS) wants the original always recoverable.

## Three architectures

**A — Enriched leaves (Slate tree is the single source of truth).** Each word is one text node carrying `{text, start, end, score, speaker?}` plus style marks. Simplest, fully WYSIWYG, export is a tree walk. But you are now fighting the normalizer for your life: identical-marked adjacent words merge (boundaries gone), and any style spanning a word boundary forces splits/merges that scramble timing. Sub-word styling is ill-defined (which fragment keeps the timestamp?). Survivable only by giving each word leaf a unique `id` (leaves with differing ids never merge) and forbidding edits that split a word leaf. You're bending Slate against its grain.

**B — Sidecar / overlay (separation of concerns).** Canonical store is the frozen `words[]` keyed by stable id. The editable document is a _projection_: an ordered list of word-id references (reordering/deletion = manipulating references, so originals survive and deletes are reversible) plus a style-annotation set keyed by word-id ranges (`{fromId, fromOffset, toId, toOffset, mark}`) plus structural metadata (paragraph breaks, speaker per block). Slate is compiled _from_ these layers; Slate edits are decompiled back into operations on them. WhisperX data is guaranteed intact because it is never touched. Styling and timing are fully orthogonal, and sub-word styling is just a character offset into a word — harmless to that word's timing. Cost: you build a compile step (model→Slate) and a sync step (Slate ops→model), plus selection↔word-id bookkeeping.

**C — Hybrid: atomic word leaves + decorations for styling (my recommendation).** This is B's separation, but it exploits the one Slate primitive built for exactly this: **decorations**. Decorations are range-based, computed-at-render formatting that never enter the stored tree and never trigger normalization or merging (it's how syntax/search highlighting works). So:

- _Persisted tree_ = paragraphs → atomic word leaves holding only WhisperX data `{text, id, start, end, score, speaker}`. Structural edits (delete word, split/merge paragraph, reassign speaker, correct text) happen here. Styling never does.
- _Persisted style store_ = annotation ranges anchored to word ids.
- _`decorate()`_ reads the style store, maps word-id ranges → current Slate paths, emits decoration ranges. Slate paints marks at render with zero tree mutation.

The payoff: styling physically cannot corrupt word/timing data because it never lives in the same structure. Confidence highlighting (e.g. score < 0.5) is _also_ just a decoration, so it composes for free with styling.

Here's the layered model for C and how export falls out of it:Slate normalization is the single load-bearing risk in this whole design, so before the architectures, the rule that makes all of them safe: **freeze the WhisperX import as an immutable base, and represent every edit — text correction, deletion, reorder, speaker fix, styling — as an additive layer, never an in-place mutation.** Overwrite a leaf's `.text` to fix "there"→"their" and you've silently destroyed raw ASR output; for an archival use you want the original always recoverable.

## Three architectures

**A — Enriched leaves (Slate tree is the source of truth).** Each word is one text node carrying `{text, start, end, score, speaker?}` plus style marks. Simplest, fully WYSIWYG, export is a tree walk. But you're now fighting the normalizer: identically-marked adjacent words merge (boundaries gone), and any style spanning a word boundary forces splits/merges that scramble timing. Sub-word styling is ill-defined (which fragment keeps the timestamp?). Survivable only by giving each word leaf a unique `id` (leaves with differing ids never merge) and forbidding edits that split a word leaf — i.e. bending Slate hard against its grain.

**B — Sidecar / overlay (separation of concerns).** Canonical store is the frozen `words[]` keyed by stable id. The editable document is a _projection_: an ordered list of word-id references (so reorder/delete = manipulating references; originals survive and deletes are reversible), plus a style-annotation set keyed by word-id ranges (`{fromId, fromOffset, toId, toOffset, mark}`), plus structural metadata (paragraph breaks, speaker per block). Slate is compiled _from_ these layers; Slate edits are decompiled _back_ into operations on them. WhisperX data is guaranteed intact because it's never touched; styling and timing are fully orthogonal; sub-word styling is just a character offset into a word, harmless to timing. Cost: you build a compile step (model→Slate) and a sync step (Slate ops→model), plus selection↔word-id bookkeeping.

**C — Hybrid: atomic word leaves + decorations for styling (recommended).** This is B's separation, exploiting the one Slate primitive built for exactly this — **decorations**: range-based, computed-at-render formatting that never enters the stored tree and never triggers normalization or merging (it's how syntax/search highlighting works). So the persisted tree holds _only_ WhisperX data in atomic word leaves; structural edits happen there; the style store is separate; and `decorate()` maps word-id ranges to paths and paints marks at render with zero tree mutation. Styling physically _cannot_ corrupt timing because they never share a structure. Bonus: low-confidence highlighting (score < 0.5) is also just a decoration, so it composes for free.

Here's the layered model for C and how export falls out of it:## Cross-cutting concerns (apply to all three)

_Atomicity and the normalizer._ Whatever you choose, give each word a stable `id` and treat the word as the indivisible unit. In A this is what prevents merges; in B/C the words live outside the editable marks entirely. If you want inline text correction, either make word leaves controlled tokens (double-click-to-edit, recompute nothing) or intercept text-level ops in `onChange` — never let Slate freely split a word leaf, or you inherit "which fragment owns the timestamp."

_Whitespace and punctuation._ WhisperX word tokens don't carry surrounding spaces consistently. Decide once: words are the only timed atoms; inter-word whitespace is non-timed rendering; trailing punctuation either attaches to the preceding word (inheriting its `end`) or becomes a zero-duration token. Getting this wrong is the most common source of off-by-one timing in transcript editors.

_Slate → model sync._ Listen to `editor.operations` per change and translate them into layer mutations (`split_node`/`merge_node` → paragraph ops, `move_node` → reference reorder, `remove_node` → soft-delete from the ref list). The selection→word-id mapping is the bookkeeping you'll maintain to know which words a "bold" command covers.

_Archival fidelity — the thing that actually delivers "ALL whisper data intact."_ Keep `start/end/score/speaker` and the original `text` frozen on the base; corrections live as a separate `editedText` (keep `originalText`); deletions are soft (dropped from the reference list, fully recoverable). Diarization speaker lives as block metadata in the structural layer, with per-word speaker still in the frozen base.

_The real cost of C: anchor repair._ Because style ranges anchor to word ids, deleting a boundary word means clamping/repairing those ranges (ProseMirror-style position mapping). It's the one piece of nontrivial engineering C demands — manageable, but design it deliberately.

## Export = layer selection

The payoff of separation: every export format is just choosing which layers to serialize.

| Output                                 | base timing/score | structure | style           |
| -------------------------------------- | ----------------- | --------- | --------------- |
| WhisperX JSON (round-trips losslessly) | ✓                 | ✓         | —               |
| SRT/VTT or "timed + styled"            | ✓                 | ✓         | ✓ (inline tags) |
| HTML / docx / markdown                 | coarse or none    | ✓         | ✓               |
| Plain corrected transcript             | —                 | ✓         | —               |

"Anything in between" needs no special case — it's a subset of three orthogonal layers.

## Recommendation and phasing

Target **C**. It's the only option where styling provably can't corrupt timing, export is trivial, and the frozen base satisfies your archival goal outright.

But given you're building React fluency, **ship A first** — enriched leaves with unique word ids, an atomic-leaf `normalizeNode` that refuses to merge words, inline correction that preserves `originalText`, and styling persisted as marks. That's a working WYSIWYG editor in days, and its exact failure modes (cross-word styling, sub-word styling, strict archival) are precisely what C later fixes. The migration is mechanical **if you commit to two contracts on day one**: the immutable frozen base, and a stable per-word id. Both A and C share them.

On the BBC `slate-transcript-editor`: it sits at roughly A (per-word timing on leaves) and is a solid reference for rendering and timecode UX, but it isn't built around an immutable base — so verify its exact leaf schema in the version you pull, and bolt on the frozen-base + originalText layer yourself if archival matters.

Want me to sketch the concrete TypeScript types for the frozen base, the structural layer, and the style store — the contract both A and C build on?
