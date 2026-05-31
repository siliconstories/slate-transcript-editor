# Subtitle Spotting Principles — A Reimplementation Spec

> Distilled from the **Subtitle Edit** codebase (`src/libse`, by Nikse). This document
> codifies the _principles_ of subtitle spotting (timing, line layout, gaps, shot-change
> alignment, punctuation) as **language-agnostic rules**, so the same behavior can be
> re-implemented in another language without reading the original C#.

## How to read this document

Each principle is stated as: **Rule** (imperative, language-agnostic) · **Why** (the
subtitling rationale) · **Default** (canonical value with units) · **Configurable**
(user-tunable?) · **Edge cases**. Non-trivial algorithms include **pseudocode**.

**Fidelity note.** All numeric defaults, the optimal-duration formula, frame-conversion
math, the BeautifyTimeCodes presets, and the 24 shipped rules-profiles in the appendices
are **verified verbatim** from the cited source. Algorithm pseudocode captures the
_documented control flow and intent_; when porting subtle edge cases, cross-check against
the cited method. Citations use `file:symbol`. Paths are relative to `src/libse/`.

## Vocabulary

| Term                  | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| **Cue**               | A single subtitle event (one block of text with a start and end time).    |
| **In-cue / Out-cue**  | The start time and end time of a cue.                                     |
| **Gap**               | Idle time between one cue's out-cue and the next cue's in-cue.            |
| **Overlap**           | Negative gap — a cue's out-cue is after the next cue's in-cue.            |
| **CPS**               | Characters per second — the primary reading-speed metric.                 |
| **WPM**               | Words per minute — a secondary reading-speed metric (display-only).       |
| **Frame**             | One video frame; durations snap to frames at the project frame rate.      |
| **Shot change / cut** | A visual scene transition in the video; cues are aligned to these.        |
| **Connected cues**    | Two adjacent cues with a very small gap (one sentence split in two).      |
| **Chainable cues**    | Two adjacent cues close enough to be joined/aligned, but not "connected". |
| **Red / green zone**  | Distance bands around a cut: red = mandatory snap, green = soft snap.     |

---

## Table of contents

1. [Reading speed](#1-reading-speed)
2. [Display duration](#2-display-duration)
3. [Gaps & overlaps](#3-gaps--overlaps)
4. [Line length](#4-line-length)
5. [Line breaking & balancing](#5-line-breaking--balancing)
6. [Number of lines](#6-number-of-lines)
7. [Merging & splitting subtitles](#7-merging--splitting-subtitles)
8. [Dialogue formatting](#8-dialogue-formatting)
9. [Punctuation & continuation](#9-punctuation--continuation)
10. [Shot-change-aware timing](#10-shot-change-aware-timing)
11. [Frame rate & time-code framing](#11-frame-rate--time-code-framing)
12. [Canonical defaults table](#12-canonical-defaults-table)
13. [Appendix A — BeautifyTimeCodes presets (in full)](#appendix-a--beautifytimecodes-presets-in-full)
14. [Appendix B — Shipped rules profiles (in full)](#appendix-b--shipped-rules-profiles-in-full)

---

## 1. Reading speed

Reading speed is the master constraint of spotting: text must stay on screen long enough to
read comfortably. It is enforced as **characters per second (CPS)**; **words per minute
(WPM)** is tracked but advisory.

### 1.1 Maximum reading speed (CPS)

- **Rule:** A cue's reading speed `chars / durationSeconds` must not exceed the maximum CPS.
- **Why:** Beyond a ceiling, viewers cannot read the text before it disappears.
- **Default:** `25.0` CPS. Optimal target `15.0` CPS.
- **Configurable:** Yes (per profile).
- **Embedded in:** `Settings/GeneralSettings.cs` (`SubtitleMaximumCharactersPerSeconds = 25.0`,
  `SubtitleOptimalCharactersPerSeconds = 15.0`); `Common/Paragraph.cs:GetCharactersPerSecond`.

### 1.2 Maximum reading speed (WPM)

- **Rule:** A cue's `60 / durationSeconds × wordCount` should not exceed the maximum WPM.
- **Why:** Alternative readability metric preferred by some standards.
- **Default:** `400` WPM.
- **Configurable:** Yes. **Edge case:** WPM is **display-only** — automatic duration fixing is
  driven by CPS, not WPM.
- **Embedded in:** `GeneralSettings.cs` (`SubtitleMaximumWordsPerMinute = 400`);
  `Paragraph.cs:WordsPerMinute`.

### 1.3 How characters are counted (counting strategies)

- **Rule:** When measuring length for CPS, strip all markup first, then count visible text
  according to the active _counting strategy_.
- **Why:** Tags aren't read; languages differ in how a "character" maps to reading effort.
- **Default:** "Count all" (`CalcAll`); the empty strategy name means `CalcAll`.
- **Always excluded from the count:** HTML/WebVTT tags (`<i> <b> <u> <font> <v> <c>`), SSA/ASS
  override blocks (`{\...}`), control characters, zero-width spaces, and bidirectional
  direction marks.
- **Strategies** (`Common/TextLengthCalculator/*`, selected by `CpsLineLengthStrategy`):
  - `CalcAll` — count every visible character (spaces and punctuation included).
  - `CalcNoSpace` — exclude spaces.
  - `CalcNoSpaceOrPunctuation` — exclude spaces and punctuation.
  - `CalcCjk` / `CalcCjkNoSpace` — **full-width CJK characters count as 1.0, half-width as 0.5**.
  - `CalcIgnoreArabicDiacritics` (+ `…NoSpace`) — ignore Arabic diacritical marks.
  - `CalcIncludeCompositionCharacters` (+ `…NotSpace`) — include combining marks.
  - `…CpsOnly` variants — count differently for CPS than for display width.
- **Embedded in:** `Common/StringExtensions.cs:CountCharacters`; `TextLengthCalculator/CalcFactory.cs`;
  `CalcAll.cs`; `CalcCJK.cs`.

```
# CalcAll (default)
function countChars(text, forCps):
    s = removeMarkup(text)            # HTML/WebVTT/SSA tags removed
    n = 0
    for element in graphemeClusters(s):
        ch = element if single-char else element
        if isControl(ch): continue
        if ch in {U+200B, U+FEFF, U+200E, U+200F, U+202A..U+202E}: continue
        if element == "\r\n": continue
        n += 1
    return n

# CalcCjk — same, but weight by width
function countCharsCjk(text):
    n = 0
    for ch in removeMarkup(text):
        n += (ch is full-width CJK) ? 1.0 : 0.5
    return n
```

### 1.4 Reading-speed tiers

- **Rule:** Classify each cue's CPS into three tiers: ≤ optimal (comfortable),
  optimal–max (acceptable), > max (too fast → must fix).
- **Why:** Drives the editor's colour feedback and the auto-fix targets.
- **Default:** optimal `15.0`, max `25.0`.

---

## 2. Display duration

### 2.1 Minimum display duration

- **Rule:** Every cue must stay on screen for at least the minimum duration.
- **Why:** Even one word needs a perceptible dwell time to be read.
- **Default:** `1000` ms.
- **Configurable:** Yes. **Edge case:** if a cue cannot be extended without colliding with the
  next cue's minimum gap, leave it and log it rather than create an overlap.
- **Embedded in:** `GeneralSettings.cs` (`SubtitleMinimumDisplayMilliseconds = 1000`);
  `Common/FixDurationLimits.cs`; `Forms/FixCommonErrors/FixShortDisplayTimes.cs`.

### 2.2 Maximum display duration

- **Rule:** No cue should stay on screen longer than the maximum duration.
- **Why:** Over-long cues read as "stuck" and usually mean a missed cue split.
- **Default:** `8000` ms (8 s). **Fix:** trim the out-cue to the maximum.
- **Embedded in:** `GeneralSettings.cs` (`SubtitleMaximumDisplayMilliseconds = 8000`);
  `FixDurationLimits.cs`; `Forms/FixCommonErrors/FixLongDisplayTimes.cs`.

### 2.3 Optimal duration from reading speed _(core formula)_

- **Rule:** Derive a natural duration from character count and the optimal CPS, then nudge
  very short and very long results toward comfortable values, and clamp to the min/max.
- **Why:** Gives a sensible automatic duration for any text (used for new cues and as the
  target when resolving overlaps).
- **Default:** optimal CPS `15.0`; invalid CPS (outside `[2, 100]`) falls back to `14.7`.
- **Embedded in:** `Common/Utilities.cs:GetOptimalDisplayMilliseconds` _(verified verbatim)_.

```
function optimalDurationMs(text, optimalCps = 15.0, onlyOptimal = false, enforceLimits = true):
    if optimalCps < 2 or optimalCps > 100:
        optimalCps = 14.7
    dur = countChars(text, forCps=true) / optimalCps * 1000

    if not onlyOptimal:
        if   dur < 1400: dur = dur * 1.2          # stretch very short cues
        elif dur < 1680: dur = 1680               # floor the short band
        elif dur > 2900: dur = max(2900, dur * 0.96)   # gently compress long cues

    if enforceLimits:
        dur = clamp(dur, minDisplayMs, maxDisplayMs)   # 1000 .. 8000 by default
    return dur
```

### 2.4 Extending a too-short cue _(resolution cascade)_

- **Rule:** When a cue is under the minimum duration (or over max CPS), try a prioritized set
  of moves, preferring those that disturb neighbors least.
- **Why:** Fix readability without cascading timing changes through the file.
- **Order** (`Forms/FixCommonErrors/FixShortDisplayTimes.cs`):
  1. Extend the out-cue into free space before the next cue (respecting the minimum gap).
  2. Pull the in-cue earlier by a small amount (≤ ~50 ms) if there's room behind.
  3. Extend out-cue _and_ shift the next cue forward, if there's room after the next cue.
  4. Shorten the next cue and extend into the freed space (if the next stays readable).
  5. Pull the in-cue earlier by a larger amount (≤ ~200 ms).
- **Edge case:** if no move fits, leave the cue unchanged and log it.

---

## 3. Gaps & overlaps

### 3.1 Minimum gap between cues

- **Rule:** Consecutive cues must be separated by at least the minimum gap (no touching, no
  overlap).
- **Why:** A visible blink between cues signals "new subtitle" and prevents flicker.
- **Default:** `24` ms. _(This is frame-derived; broadcast profiles set it in frames, e.g.
  2 frames ≈ 83 ms @ 23.976 fps, or larger.)_
- **Configurable:** Yes (per profile; often expressed as 2–4 frames).
- **Fix:** if `0 < gap < minGap`, pull the earlier cue's out-cue back to `next.in − minGap`.
- **Embedded in:** `GeneralSettings.cs` (`MinimumMillisecondsBetweenLines = 24`);
  `Forms/FixCommonErrors/FixShortGaps.cs`.

### 3.2 Bridging gaps

- **Rule:** Optionally close small gaps (within a max) so a cue stays up until just before the
  next one, keeping the minimum gap.
- **Why:** Removes distracting flicker between rapid cues; maximizes on-screen time.
- **Embedded in:** `Forms/DurationsBridgeGaps.cs`.

```
function bridgeGaps(cues, minGapMs, divideEven, maxGapMs):
    for each adjacent (cur, next):
        gap = next.in - cur.out
        if gap <= minGapMs or gap > maxGapMs: continue
        if divideEven:
            next.in = next.in - gap / 2          # share the closure
        cur.out = next.in - minGapMs
```

### 3.3 Overlap resolution _(cascade)_

- **Rule:** When cues overlap, separate them while keeping both as readable as possible —
  prefer giving each its _optimal_ duration; if that's impossible, fall back to its _wanted_
  duration (computed at the maximum CPS).
- **Why:** Overlaps are invalid output; resolution must not destroy readability.
- **Order** (`Forms/FixCommonErrors/FixOverlappingDisplayTimes.cs`):
  1. Near-equal overlap (< 1 ms): nudge by ±1 ms.
  2. If the earlier cue already fits its optimal duration → truncate its out-cue.
  3. If splitting the overlap in half lets both fit optimal → split evenly.
  4. If the later cue fits its optimal in the remaining space → push its in-cue forward.
  5. Repeat 2–4 using _wanted_ (max-CPS) durations instead of optimal.
  6. Last resort for tiny gaps: nudge earlier cue back ~2 ms and advance the later in-cue.
  7. If nothing works: log, leave unchanged.
- **Edge case:** subtitle formats that allow it (ASS/ASSA) may permit `out == next.in`
  (touching with no gap) when configured.

---

## 4. Line length

### 4.1 Maximum characters per line

- **Rule:** No single line may exceed the maximum line length, measured **after** stripping
  markup.
- **Why:** Long lines run off the safe area and slow reading.
- **Default:** `43` characters per line.
- **Configurable:** Yes (per profile; e.g. 42 for Netflix English, 16 for Simplified Chinese).
- **Edge case:** the active CPS counting strategy (e.g. CJK weighting) also governs how line
  length is counted; non-breaking space is normalized to a normal space first.
- **Embedded in:** `GeneralSettings.cs` (`SubtitleLineMaximumLength = 43`);
  `Common/Utilities.cs:GetMaxLineLength`; `Common/HtmlUtil.cs:RemoveHtmlTags`;
  `Forms/FixCommonErrors/FixLongLines.cs`.

### 4.2 Maximum pixel width per line (optional)

- **Rule:** Optionally constrain each line by **rendered pixel width** instead of (or in
  addition to) character count, using the display font's metrics.
- **Why:** Proportional fonts make "iiii" and "WWWW" very different widths; pixel width is the
  true on-screen constraint.
- **Default:** `576` px. Measurement uses the font metrics; for strings longer than ~128
  characters it falls back to an estimate (~5 px/char) for speed.
- **Configurable:** Yes (`SubtitleLineMaximumPixelWidth`, and the `AutoBreakUsePixelWidth`
  toggle).
- **Embedded in:** `GeneralSettings.cs` (`SubtitleLineMaximumPixelWidth = 576`);
  `Forms/FixCommonErrors/FixShortLinesPixelWidth.cs`; `Common/TextSplitResult.cs`.

---

## 5. Line breaking & balancing

### 5.1 Where a break is allowed

- **Rule:** A line may only break at a space/tab, and never immediately after a word on the
  language's _no-break-after_ list, nor before a French-spaced `? ! .`, nor between
  sentence-punctuation and a following dash (`?-`, `!-`, `.-`).
- **Why:** Keeps grammatical units together (e.g. "Mr. Smith", "n°", titles, numbers).
- **Default:** per-language `*_NoBreakAfterList.xml` (entries may be plain text or regex).
- **Embedded in:** `Common/Utilities.cs:CanBreak`, `NoBreakAfterList`;
  `Common/NoBreakAfterItem.cs` _(CanBreak verified verbatim)_.

```
function canBreak(s, index, language):
    if s[index] not in {space, tab}: return false
    prefix = s[0 .. index]
    for item in noBreakAfterList(language):
        if item.matches(prefix): return false      # plain suffix or regex
    return true
```

### 5.2 Choosing the break point (two-line balancing)

- **Rule:** To split one long line into two, pick the allowed break that best **balances** the
  two lines, with a priority order of preferred break kinds.
- **Why:** Balanced lines (similar length) read better and look intentional; breaking at
  natural boundaries respects syntax.
- **Priority of preferred breaks:**
  1. **Dialogue split** — break so the second line begins a new speaker dash (when the first
     line ends a sentence). _(enabled by default: `AutoBreakDashEarly = true`)_
  2. **Sentence-ending** punctuation (`. ! ? …` and language equivalents). _(`AutoBreakLineEndingEarly = false` by default)_
  3. **Comma** (and `، 、` equivalents). _(`AutoBreakCommaBreakEarly = false` by default)_
  4. **Best balance** — minimize the line-length difference. By default this is measured in
     **pixels** (`AutoBreakUsePixelWidth = true`) and may **prefer a slightly heavier bottom
     line**, biased by `AutoBreakPreferBottomPercent` percent of the average (default `5%`)
     when `AutoBreakPreferBottomHeavy = true`; otherwise it minimizes character-count
     difference. The pixel-balance candidate "bottom-heavy" test allows the bottom line to be
     up to ~2 px shorter than the top and still count as bottom-heavy.
  5. If no allowed break keeps both lines within the limit, fall back to the best available
     break anyway.
- **Edge cases:** already-formatted **dialogue** (both lines start with a dash) is left
  unbroken; **music/lyrics** lines (♪) are not auto-broken; CJK may break at `，。？、` without a
  space; markup tag positions are recorded and re-inserted after the split, and a closing tag
  landing at the break is moved to the end of the previous line.
- **Embedded in:** `Common/TextSplit.cs:AutoBreak` →
  `GetBestDialog / GetBestEnding / GetBestPixelSplit / GetBestLengthSplit`;
  `Common/TextSplitResult.cs:DiffFromAverage / DiffFromAveragePixel / DiffFromAveragePixelBottomHeavy`;
  `Common/Utilities.cs:AutoBreakLinePrivate` (markup handling, dialogue/music guards);
  `Settings/ToolsSettings.cs` (the `AutoBreak*` flags).

```
function autoBreakTwoLines(text, maxLen, mergeShorterThan, language):
    plain = removeMarkup(text)
    if countChars(plain) < mergeShorterThan and no existing newline:
        return text                               # too short to bother
    s = removeLineBreaks(text)
    if isFormattedDialogue(s): return s            # leave 2-speaker dialogue alone

    candidates = []
    for i in breakablePositions(s):                # spaces where canBreak() is true
        line1, line2 = s[..i], s[i..]
        if both within maxLen (chars or pixels):
            candidates.add(i, score = lengthDiff(line1, line2))

    best = pick by priority: dialogueBreak > sentenceEnd > comma > min(score)
    if bottomHeavyEnabled and line2 not heavier:
        prefer an alternative that biases the bottom line heavier
        (by AutoBreakPreferBottomPercent% of the average line width)
    if best is none: best = overall min(score)     # fallback even if over limit
    return s with newline at best
```

---

## 6. Number of lines

### 6.1 Maximum lines per cue

- **Rule:** A cue must not exceed the maximum number of display lines.
- **Why:** More than two lines covers too much picture and lowers dwell time per line.
- **Default:** `2` lines (`MaxNumberOfLinesPlusAbort = 1` is the tolerance margin used when
  auto-breaking decides whether to give up).
- **Configurable:** Yes.
- **Embedded in:** `GeneralSettings.cs` (`MaxNumberOfLines = 2`);
  `Forms/FixCommonErrors/Fix3PlusLines.cs`; `Common/Utilities.cs:GetNumberOfLines`.

### 6.2 More than two lines

- **Rule:** Only when the max is set above two does the splitter distribute text across 3+
  lines: it first tries structured splits (3 lines, then 4) at sentence/punctuation
  boundaries, then falls back to an even distribution across N lines, each within the limit.
- **Embedded in:** `Common/Utilities.cs:AutoBreakLineMoreThanTwoLines` (uses
  `PlainTextImporter.SplitToThree/SplitToFour`).

---

## 7. Merging & splitting subtitles

### 7.1 Merge short adjacent cues

- **Rule:** Combine a line/cue with its neighbor when the merged text stays under the
  "merge-shorter-than" threshold and timing/content qualify.
- **Why:** Avoids choppy one- or two-word flashes; improves reading flow.
- **Default:** `33` characters (`0` disables). _(Shipped profiles set this to roughly
  line-length + 1 — e.g. 43 — so two short lines merge whenever they'd fit one line; TikTok
  uses `0`.)_
- **Edge case:** when merging, identical surrounding markup tags are preserved and only the
  inner text is joined.
- **Embedded in:** `GeneralSettings.cs` (`MergeLinesShorterThan = 33`);
  `Common/MergeShortLinesUtils.cs`; `Common/Utilities.cs:QualifiesForMerge`.

### 7.2 Merge identical / co-timed cues

- **Rule:** Merge consecutive cues that share the same text, or the same time codes.
- **Embedded in:** `Common/MergeLinesSameTextUtils.cs`; `Forms/MergeLinesWithSameTimeCodes.cs`.

### 7.3 Split long lines

- **Rule:** Split a single over-long line into multiple cues/lines respecting the maximum
  length and the break rules of §5.
- **Embedded in:** `Forms/SplitLongLinesHelper.cs`.

---

## 8. Dialogue formatting

### 8.1 Speaker dashes

- **Rule:** When two speakers share one cue, mark each speaker line with a leading dash in a
  consistent style.
- **Why:** Dashes are the standard visual cue distinguishing speakers within one subtitle.
- **Styles** (`Enums/DialogType.cs`):
  - `DashBothLinesWithSpace` — `- ` on both lines _(default)_
  - `DashBothLinesWithoutSpace` — `-` on both lines
  - `DashSecondLineWithSpace` — `- ` on the second line only
  - `DashSecondLineWithoutSpace` — `-` on the second line only
- **Configurable:** Yes (per profile; e.g. Dutch profiles use `DashSecondLineWithoutSpace`).
- **Embedded in:** `GeneralSettings.cs` (`DialogStyle = DashBothLinesWithSpace`);
  `Common/DialogSplitMerge.cs`.

### 8.2 Dialogue detection

- **Rule:** Treat a cue as dialogue when it has two lines, the first line ends with
  sentence-ending punctuation, and the second line starts with a dash.
- **Why:** Distinguishes genuine two-speaker cues from a single sentence that merely wrapped.
- **Embedded in:** `Forms/FixCommonErrors/FixDialogsOnOneLine.cs`, `FixHyphensInDialog.cs`,
  `FixHyphensRemoveDashSingleLine.cs`.

---

## 9. Punctuation & continuation

A sentence that spans two cues is marked so viewers know it continues; a sentence that ends
is left clean. The marker style is selectable.

### 9.1 Continuation styles

- **Rule:** Apply a chosen continuation style, which defines the suffix added to the end of a
  continuing cue and the prefix added to the start of its continuation — with a separate
  marker for _pauses_ (gaps).
- **Default:** `None` at the app level; the rules-profile object defaults to
  `NoneLeadingTrailingDots`.
- **Styles** (`Enums/ContinuationStyle.cs`, 12 values):
  `None`, `NoneTrailingDots`, `NoneLeadingTrailingDots`, `NoneTrailingEllipsis`,
  `NoneLeadingTrailingEllipsis`, `OnlyTrailingDots`, `LeadingTrailingDots`,
  `OnlyTrailingEllipsis`, `LeadingTrailingEllipsis`, `LeadingTrailingDash`,
  `LeadingTrailingDashDots`, `Custom`.
  (`None*` styles add markers only across _pause gaps_; `…Dots` use `...`, `…Ellipsis` use the
  single glyph `…`, `…Dash` uses `- `.)
- **Embedded in:** `Common/ContinuationUtilities.cs:GetContinuationProfile`.

### 9.2 When to add a suffix / prefix

- **Rule (suffix):** Add a continuation suffix to a cue when it ends mid-sentence — i.e. it
  ends with nothing, or a comma (when configured), or already has a suffix — and does **not**
  end with `--`, `:`, or `;`.
- **Rule (prefix):** Add a continuation prefix to the _next_ cue when the previous cue takes a
  suffix and the next cue does **not** begin a new sentence.
- **Why:** Markers belong only mid-sentence; a fresh sentence must start clean.
- **Embedded in:** `ContinuationUtilities.cs:ShouldAddSuffix`, `AddSuffixIfNeeded`,
  `AddPrefixIfNeeded` _(the end-of-sentence guard is verified)_.

```
shouldAddSuffix(text) =
       not hasSuffixAlready(text)
   and not isEndOfSentence(text)
   and not text.endsWith(",")
   and not text.endsWith(":")
   and not text.endsWith(";")
   and not text.endsWith("-")
```

### 9.3 Sentence-boundary detection

- **Rule:** A text _starts a new sentence_ if it begins with a capital letter (case-aware
  languages), or `¿`/`¡`, or a lowercase `i` + capital (e.g. "iPhone"), or
  punctuation-then-lowercase-then-capital (e.g. Dutch `'s Avonds`). A text _ends a sentence_
  if it ends with `.` (but not `..`), `?`, `!`, `;`, or `--`.
- **Edge case:** ~30 case-less languages (Arabic, Chinese, Japanese, Korean, Hebrew, Hindi, …)
  skip the capitalization checks.
- **Embedded in:** `ContinuationUtilities.cs:IsNewSentence`, `IsEndOfSentence`.

### 9.4 Conjunction-aware comma

- **Rule:** When the next cue starts with a conjunction, add a comma before the continuation
  suffix to preserve grammar.
- **Default:** per-language conjunction lists (English: and/but/for/nor/yet/or/so…; plus
  Dutch, French, Portuguese lists).
- **Embedded in:** `ContinuationUtilities.cs:StartsWithConjunction`.

### 9.5 Ellipsis normalization & leading-dot cleanup

- **Rule:** Treat `...` and the single glyph `…` as equivalent; remove a cue's leading dots
  when the previous cue already ended with dots (avoid `......`).
- **Embedded in:** `Forms/FixCommonErrors/FixEllipsesStart.cs`, `FixUnnecessaryLeadingDots.cs`.

### 9.6 Pause-gap marker

- **Rule:** For gap-aware styles, treat the boundary as a _pause_ (using the gap marker) when
  `next.in − prev.out > max(minGap + 5 ms, continuationPause)`.
- **Default:** `ContinuationPause = 300` ms.
- **Embedded in:** `ContinuationUtilities.cs:GetMinimumGapMs`; `GeneralSettings.cs`
  (`ContinuationPause = 300`).

---

## 10. Shot-change-aware timing

The richest part of spotting: align cue boundaries to **shot changes** (cuts) so subtitles
respect the edit rhythm. Driven by `Forms/TimeCodesBeautifier.cs` with thresholds from
`Settings/BeautifyTimeCodesSettings.cs`. **All work is done in frames.**

### 10.1 Master switches

- `AlignTimeCodes = true` — align cues to the shot-change list.
- `SnapToShotChanges = true` — enable snapping.
- `ExtractExactTimeCodes = false` — don't force frame-exact extraction by default.
- `OverlapThreshold = 1000` ms — if two cues overlap by more than this, don't treat them as a
  connected/chainable pair.
- **Embedded in:** `BeautifyTimeCodesSettings.cs` _(verified)_.

### 10.2 Red & green zones (the snapping model)

- **Rule:** Each cue boundary has a band on each side of a nearby cut. Within the **red zone**
  (close to the cut) snapping is **mandatory**; within the **green zone** (a little farther)
  snapping is **soft** (applied only if it doesn't break other constraints). In-cues and
  out-cues have independent zone sizes, and zones differ on the left of a cut (before it) vs
  the right (after it).
- **Why:** An in-cue should land _on or just after_ a cut; an out-cue should land _on or just
  before_ a cut. Zones encode "how near is near enough to be worth snapping."
- **Defaults (Default preset, in frames):**
  - In-cue: right-red `5`, right-green `5`, left-red `3`, left-green `3`, gap `0`.
  - Out-cue: right-red `3`, right-green `12`, left-red `10`, left-green `10`, gap `0`.
  - General inter-cue gap: `3` frames.
- **Embedded in:** `TimeCodesBeautifier.cs:FindBestCueFrame`; `BeautifyTimeCodesSettings.cs`.

```
function findBestCueFrame(cueFrame, isInCue):
    prevCut = nearest cut on/before cueFrame   (or -inf)
    nextCut = nearest cut on/after  cueFrame   (or +inf)
    if no cut found: return cueFrame

    cfg = isInCue ? inCueZones : outCueZones
    # in-cues land just AFTER a cut (cut + gap); out-cues just BEFORE (cut - gap)
    gapSign = isInCue ? +1 : -1
    prevWithGap = prevCut + gapSign * cfg.gap
    nextWithGap = nextCut + gapSign * cfg.gap

    prevGreenEdge = prevCut + cfg.rightGreenZone     # soft band after the cut
    nextGreenEdge = nextCut - cfg.leftGreenZone      # soft band before the cut

    inPrevRed   = prevCut <= cueFrame <= prevCut + cfg.rightRedZone
    inNextRed   = nextCut - cfg.leftRedZone <= cueFrame <= nextCut
    inPrevGreen = prevCut + cfg.rightRedZone < cueFrame < prevGreenEdge
    inNextGreen = nextGreenEdge < cueFrame < nextCut - cfg.leftRedZone

    if inPrevRed and inNextRed:               # between two near cuts → closest wins
        return (closer of prevCut,nextCut to cueFrame) with gap
    if inPrevGreen and inNextGreen:           # both soft → least "violation"
        return whichever green edge intrudes least
    if inPrevRed:   return prevWithGap        # red zone has priority
    if inNextRed:   return nextWithGap
    if inPrevGreen: return min(prevGreenEdge, nextCut)   # clamp to opposite cut
    if inNextGreen: return max(nextGreenEdge, prevCut)
    return cueFrame                           # outside all zones → no snap
```

### 10.3 Connected cues (one sentence split in two)

- **Rule:** When two adjacent cues are very close (gap below the "treat-as-connected"
  threshold), snap their **shared boundary together** to a cut between them — out-cue just
  before the cut, in-cue just after — preserving the required gap. The "closest" gaps are
  asymmetric (different on the out side vs the in side).
- **Why:** A sentence continuing across a cut should break exactly at the cut, not drift.
- **Default:** `ConnectedSubtitlesTreatConnected = 180` ms (Default & Netflix; SDI `240`).
- **Embedded in:** `TimeCodesBeautifier.cs:FixConnectedSubtitles`,
  `FindConnectedSubtitlesBestCueFrame`, `GetFixedConnectedSubtitlesCueFrames`.

### 10.4 Chainable cues

- **Rule:** When two cues are close but not "connected" (gap up to the chaining max), chain
  them when no cut intervenes; when a cut does intervene, apply the configured behavior:
  - `ExtendUntilShotChange` — stop the earlier cue _at_ the cut (leave a gap at the cut).
  - `ExtendCrossingShotChange` — allow the boundary to cross the cut.
  - `DontChain` — leave them independent.
    In-cue-on-shot and out-cue-on-shot cases are handled with their own zones/gaps.
- **Default:** `ChainingGeneralMaxGap = 1000` ms (Netflix `500`); behavior
  `ExtendUntilShotChange` (SDI uses `ExtendCrossingShotChange`).
- **Embedded in:** `TimeCodesBeautifier.cs:FixChainableSubtitles` and its `GetFixedChainable…`
  helpers.

### 10.5 Free cues

- **Rule:** A cue that is neither connected nor chainable snaps independently to the nearest
  cut via the zone logic (§10.2), bounded so it never collides with its neighbors.
- **Embedded in:** `TimeCodesBeautifier.cs:FixCue / FixInCue / FixOutCue`.

### 10.6 Processing order

- **Rule:** Run the pass over all cues, and when a pair is repositioned together, mark the
  next cue's in-cue to be skipped so it isn't re-snapped and undone. Overlaps are removed
  first (set `left.out = right.in − 1` frame) before chaining, and a pair overlapping beyond
  `OverlapThreshold` is skipped.
- **Embedded in:** `TimeCodesBeautifier.cs:Beautify`.

---

## 11. Frame rate & time-code framing

### 11.1 Frame ↔ millisecond conversion

- **Rule:** Convert between frames and milliseconds using the _effective_ frame rate and
  round half away from zero. Drop-frame NTSC rates use their exact fractional values.
- **Why:** NTSC playback isn't the nominal rate; using `29.97` instead of `30000/1001`
  accumulates drift over a long programme. Consistent rounding avoids boundary jitter.
- **Effective rates** (`GetFrameForCalculation`): `23.976 → 24000/1001`,
  `29.97 → 30000/1001`, `59.94 → 60000/1001`, otherwise the nominal rate.
- **Default project frame rate:** `23.976` fps.
- **Embedded in:** `SubtitleFormats/SubtitleFormat.cs:MillisecondsToFrames`,
  `FramesToMilliseconds`, `GetFrameForCalculation` _(verified)_; `Common/TimeCode.cs`
  (`BaseUnit = 1000`).

```
effFps(fps) = match fps:
    23.976 -> 24000/1001
    29.97  -> 30000/1001
    59.94  -> 60000/1001
    else   -> fps

msToFrames(ms, fps)     = round( ms      / (1000 / effFps(fps)), AWAY_FROM_ZERO )
framesToMs(frames, fps) = round( frames  * (1000 / effFps(fps)), AWAY_FROM_ZERO )
```

---

## 12. Canonical defaults table

| Principle                        | Value                   | Unit     | Configurable | Source (`GeneralSettings.cs` unless noted)   |
| -------------------------------- | ----------------------- | -------- | ------------ | -------------------------------------------- |
| Max line length                  | 43                      | chars    | yes          | `SubtitleLineMaximumLength`                  |
| Max pixel width                  | 576                     | px       | yes          | `SubtitleLineMaximumPixelWidth`              |
| Max lines per cue                | 2                       | lines    | yes          | `MaxNumberOfLines`                           |
| Lines-plus-abort margin          | 1                       | lines    | yes          | `MaxNumberOfLinesPlusAbort`                  |
| Merge-shorter-than               | 33                      | chars    | yes          | `MergeLinesShorterThan`                      |
| Min display                      | 1000                    | ms       | yes          | `SubtitleMinimumDisplayMilliseconds`         |
| Max display                      | 8000                    | ms       | yes          | `SubtitleMaximumDisplayMilliseconds`         |
| Min gap between cues             | 24                      | ms       | yes          | `MinimumMillisecondsBetweenLines`            |
| Max CPS                          | 25.0                    | char/s   | yes          | `SubtitleMaximumCharactersPerSeconds`        |
| Optimal CPS                      | 15.0                    | char/s   | yes          | `SubtitleOptimalCharactersPerSeconds`        |
| Max WPM                          | 400                     | word/min | yes          | `SubtitleMaximumWordsPerMinute`              |
| Fallback CPS                     | 14.7                    | char/s   | no           | `Utilities.GetOptimalDisplayMilliseconds`    |
| Optimal: short stretch threshold | 1400                    | ms       | no           | `Utilities.GetOptimalDisplayMilliseconds`    |
| Optimal: short floor             | 1680                    | ms       | no           | `Utilities.GetOptimalDisplayMilliseconds`    |
| Optimal: long compress threshold | 2900                    | ms       | no           | `Utilities.GetOptimalDisplayMilliseconds`    |
| Dialogue style                   | DashBothLinesWithSpace  | enum     | yes          | `DialogStyle`                                |
| Continuation style (app)         | None                    | enum     | yes          | `ContinuationStyle`                          |
| Continuation style (profile obj) | NoneLeadingTrailingDots | enum     | yes          | `RulesProfile()` ctor                        |
| Auto-break: dash early           | true                    | bool     | yes          | `ToolsSettings.AutoBreakDashEarly`           |
| Auto-break: ending early         | false                   | bool     | yes          | `ToolsSettings.AutoBreakLineEndingEarly`     |
| Auto-break: comma early          | false                   | bool     | yes          | `ToolsSettings.AutoBreakCommaBreakEarly`     |
| Auto-break: use pixel width      | true                    | bool     | yes          | `ToolsSettings.AutoBreakUsePixelWidth`       |
| Auto-break: prefer bottom-heavy  | true                    | bool     | yes          | `ToolsSettings.AutoBreakPreferBottomHeavy`   |
| Auto-break: bottom-heavy bias    | 5.0                     | % of avg | yes          | `ToolsSettings.AutoBreakPreferBottomPercent` |
| Default frame rate               | 23.976                  | fps      | yes          | `DefaultFrameRate`                           |
| Beautify: align time codes       | true                    | bool     | yes          | `BeautifyTimeCodesSettings`                  |
| Beautify: snap to shot changes   | true                    | bool     | yes          | `BeautifyTimeCodesSettings`                  |
| Beautify: extract exact codes    | false                   | bool     | yes          | `BeautifyTimeCodesSettings`                  |
| Beautify: overlap threshold      | 1000                    | ms       | yes          | `BeautifyTimeCodesSettings`                  |

---

## Appendix A — BeautifyTimeCodes presets (in full)

All values in **frames** unless suffixed `ms`. Verified from
`Settings/BeautifyTimeCodesSettings.cs` (`BeautifyTimeCodesProfile` constructor).

| Field                                   | Default               | Netflix               | SDI                      |
| --------------------------------------- | --------------------- | --------------------- | ------------------------ |
| Gap (general)                           | 3                     | 2                     | 4                        |
| InCuesGap                               | 0                     | 0                     | 2                        |
| InCuesLeftGreenZone                     | 3                     | 12                    | 12                       |
| InCuesLeftRedZone                       | 3                     | 7                     | 7                        |
| InCuesRightRedZone                      | 5                     | 7                     | 7                        |
| InCuesRightGreenZone                    | 5                     | 12                    | 12                       |
| OutCuesGap                              | 0                     | 2                     | 2                        |
| OutCuesLeftGreenZone                    | 10                    | 12                    | 12                       |
| OutCuesLeftRedZone                      | 10                    | 7                     | 7                        |
| OutCuesRightRedZone                     | 3                     | 7                     | 7                        |
| OutCuesRightGreenZone                   | 12                    | 12                    | 12                       |
| ConnectedSubtitlesInCueClosestLeftGap   | 3                     | 2                     | 2                        |
| ConnectedSubtitlesInCueClosestRightGap  | 0                     | 0                     | 2                        |
| ConnectedSubtitlesOutCueClosestLeftGap  | 0                     | 2                     | 2                        |
| ConnectedSubtitlesOutCueClosestRightGap | 3                     | 0                     | 2                        |
| ConnectedSubtitlesLeftGreenZone         | 3                     | 12                    | 12                       |
| ConnectedSubtitlesLeftRedZone           | 3                     | 7                     | 7                        |
| ConnectedSubtitlesRightRedZone          | 3                     | 7                     | 7                        |
| ConnectedSubtitlesRightGreenZone        | 3                     | 12                    | 12                       |
| ConnectedSubtitlesTreatConnected (ms)   | 180                   | 180                   | 240                      |
| ChainingGeneralUseZones                 | false                 | false                 | false                    |
| ChainingGeneralMaxGap (ms)              | 1000                  | 500                   | 1000                     |
| ChainingGeneralLeftGreenZone            | 25                    | 12                    | 25                       |
| ChainingGeneralLeftRedZone              | 24                    | 11                    | 24                       |
| ChainingGeneralShotChangeBehavior       | ExtendUntilShotChange | ExtendUntilShotChange | ExtendCrossingShotChange |
| ChainingInCueOnShotUseZones             | false                 | false                 | false                    |
| ChainingInCueOnShotMaxGap (ms)          | 1000                  | 500                   | 1000                     |
| ChainingInCueOnShotLeftGreenZone        | 25                    | 12                    | 25                       |
| ChainingInCueOnShotLeftRedZone          | 24                    | 11                    | 24                       |
| ChainingInCueOnShotShotChangeBehavior   | ExtendUntilShotChange | ExtendUntilShotChange | ExtendCrossingShotChange |
| ChainingInCueOnShotCheckGeneral         | true                  | true                  | true                     |
| ChainingOutCueOnShotUseZones            | false                 | false                 | true                     |
| ChainingOutCueOnShotMaxGap (ms)         | 500                   | 500                   | 500                      |
| ChainingOutCueOnShotRightRedZone        | 11                    | 11                    | 7                        |
| ChainingOutCueOnShotRightGreenZone      | 12                    | 12                    | 12                       |
| ChainingOutCueOnShotShotChangeBehavior  | ExtendUntilShotChange | ExtendUntilShotChange | ExtendCrossingShotChange |
| ChainingOutCueOnShotCheckGeneral        | true                  | true                  | true                     |

**Chaining behavior enum:** `DontChain = 0`, `ExtendCrossingShotChange = 1`,
`ExtendUntilShotChange = 2`.

---

## Appendix B — Shipped rules profiles (in full)

Verified verbatim from `Settings/GeneralSettings.cs` (`AddExtraProfiles`) plus the active
`Default` profile (which mirrors the `GeneralSettings` defaults). Columns: **Len** = max line
length (chars), **Merge** = merge-shorter-than (chars), **MaxCPS / OptCPS**, **MaxDisp /
MinDisp** (ms), **Gap** = min ms between cues, **WPM** = max WPM, **Dialogue** = dash style,
**Continuation** = continuation style. Every profile sets **MaxNumberOfLines = 2**, and all
use the **CalcAll** counting strategy (an empty strategy name resolves to CalcAll; "Amazon
Prime (Arabic)" sets it explicitly). Note the gaps are in **ms**, chosen per frame rate (e.g.
83 ms ≈ 2 frames @ 23.976 fps).

| Profile                               | Len | Merge | MaxCPS | OptCPS | MaxDisp | MinDisp | Gap | WPM | Dialogue                   | Continuation                |
| ------------------------------------- | --- | ----- | ------ | ------ | ------- | ------- | --- | --- | -------------------------- | --------------------------- |
| Default                               | 43  | 33    | 25     | 15     | 8000    | 1000    | 24  | 400 | DashBothLinesWithSpace     | None                        |
| Netflix (English)                     | 42  | 43    | 20     | 15     | 7007    | 833     | 83  | 240 | DashBothLinesWithoutSpace  | NoneLeadingTrailingEllipsis |
| Netflix (Other languages)             | 42  | 43    | 17     | 12     | 7007    | 833     | 83  | 204 | DashBothLinesWithSpace     | NoneLeadingTrailingEllipsis |
| Netflix (Dutch)                       | 42  | 43    | 17     | 12     | 7007    | 833     | 83  | 204 | DashSecondLineWithoutSpace | LeadingTrailingEllipsis     |
| Netflix (Simplified Chinese)          | 16  | 17    | 9      | 9      | 7007    | 833     | 83  | 100 | DashBothLinesWithoutSpace  | LeadingTrailingEllipsis     |
| Amazon Prime (English/Spanish/French) | 42  | 43    | 17     | 12     | 7007    | 1000    | 83  | 204 | DashBothLinesWithSpace     | NoneLeadingTrailingEllipsis |
| Amazon Prime (Arabic)                 | 42  | 43    | 20     | 12     | 7007    | 1000    | 83  | 240 | DashBothLinesWithSpace     | NoneLeadingTrailingEllipsis |
| Amazon Prime (Danish)                 | 42  | 43    | 17     | 12     | 7007    | 1000    | 83  | 204 | DashBothLinesWithoutSpace  | NoneLeadingTrailingEllipsis |
| Amazon Prime (Dutch)                  | 42  | 43    | 17     | 12     | 7007    | 1000    | 83  | 204 | DashSecondLineWithoutSpace | OnlyTrailingEllipsis        |
| TikTok/YouTube-shorts (9:16)          | 24  | 0     | 25     | 18     | 5000    | 700     | 0   | 300 | DashBothLinesWithSpace     | None                        |
| Arte (German/English)                 | 40  | 41    | 20     | 12     | 10000   | 1000    | 200 | 240 | DashBothLinesWithSpace     | None                        |
| Dutch professional (23.976/24 fps)    | 42  | 43    | 15     | 11     | 7007    | 1400    | 125 | 180 | DashSecondLineWithoutSpace | OnlyTrailingDots            |
| Dutch professional (25 fps)           | 42  | 43    | 15     | 11     | 7000    | 1400    | 120 | 180 | DashSecondLineWithoutSpace | OnlyTrailingDots            |
| Dutch fansubs (23.976/24 fps)         | 45  | 46    | 22.5   | 12     | 7007    | 1200    | 125 | 300 | DashSecondLineWithSpace    | OnlyTrailingDots            |
| Dutch fansubs (25 fps)                | 45  | 46    | 22.5   | 12     | 7000    | 1200    | 120 | 300 | DashSecondLineWithSpace    | OnlyTrailingDots            |
| Danish professional (23.976/24 fps)   | 40  | 41    | 15     | 10     | 8008    | 2002    | 125 | 180 | DashBothLinesWithSpace     | LeadingTrailingDashDots     |
| Danish professional (25 fps)          | 40  | 41    | 15     | 10     | 8000    | 2000    | 120 | 180 | DashBothLinesWithSpace     | LeadingTrailingDashDots     |
| SDI (Dutch)                           | 37  | 38    | 18.75  | 12     | 7000    | 1320    | 160 | 225 | DashSecondLineWithoutSpace | OnlyTrailingDots            |
| SW2 (French) (23.976/24 fps)          | 40  | 41    | 25     | 18     | 5005    | 792     | 125 | 300 | DashBothLinesWithSpace     | None                        |
| SW2 (French) (25 fps)                 | 40  | 41    | 25     | 18     | 5000    | 800     | 120 | 300 | DashBothLinesWithSpace     | None                        |
| SW3 (French) (23.976/24 fps)          | 40  | 41    | 25     | 18     | 5005    | 792     | 167 | 300 | DashBothLinesWithSpace     | None                        |
| SW3 (French) (25 fps)                 | 40  | 41    | 25     | 18     | 5000    | 800     | 160 | 300 | DashBothLinesWithSpace     | None                        |
| SW4 (French) (23.976/24 fps)          | 40  | 41    | 25     | 18     | 5005    | 792     | 250 | 300 | DashBothLinesWithSpace     | None                        |
| SW4 (French) (25 fps)                 | 40  | 41    | 25     | 18     | 5000    | 800     | 240 | 300 | DashBothLinesWithSpace     | None                        |

### Rules-profile schema

A profile bundles these 12 fields (`Common/RulesProfile.cs`): `Name`,
`SubtitleLineMaximumLength`, `SubtitleOptimalCharactersPerSeconds`,
`SubtitleMaximumCharactersPerSeconds`, `SubtitleMaximumWordsPerMinute`,
`SubtitleMinimumDisplayMilliseconds`, `SubtitleMaximumDisplayMilliseconds`,
`MinimumMillisecondsBetweenLines`, `CpsLineLengthStrategy`, `MaxNumberOfLines`,
`MergeLinesShorterThan`, `DialogStyle`, `ContinuationStyle`.

---

_End of spec._
