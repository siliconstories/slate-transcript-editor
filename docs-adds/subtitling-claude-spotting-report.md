# Subtitle Spotting (Timing / Cueing): A Technical Reference Manual

_For human subtitlers and for developers/LLMs building automated subtitle tools. Rules are stated as concrete, parseable values with units. Where standards diverge or no consensus exists, variations are shown side by side. Anchors: BBC Subtitle Guidelines v1.2.3 (English); ARD/ORF/SRF/ZDF Untertitel-Standards v1.3 (German)._

## TL;DR

- **Two anchors.** English = BBC Subtitle Guidelines v1.2.3 (June 2024); German = ARD/ORF/SRF/ZDF Untertitel-Standards v1.3 (April 2015). Core cross-standard consensus: min duration ~1 s (Netflix 5/6 s = 20 frames @24fps); max ~6 s (BBC/"six-second rule") to 7 s (Netflix); min gap 1 frame (ARD) / 2 frames (Netflix); reading speed ~12–15 CPS broadcast, up to 17 CPS (Netflix most languages) and 20 CPS (Netflix English); 37 chars/line (ARD/SRF/BBC broadcast) to 42 (Netflix); max 2 lines.
- **Divergences are real and numeric** — frame gaps, CPS caps, shot-change frame zones, dialogue dashes and quotation marks all differ by standard. The live debate is rising reading speed: Netflix English 20 CPS vs the academic ~12 CPS / 144 WPM optimum (Romero-Fresco/Díaz Cintas via the six-second rule), with eye-tracking (Szarkowska & Gerber-Morón, PLOS ONE 2018) showing viewers cope with 20 CPS but spend proportionally more time reading.
- **Documented language/Swiss typographic differences** (only where they actually exist): German „…" vs Swiss German «…»; French « … » with (non-breaking) spaces vs Swiss Romand «…» with thin/no space; Italian 2nd-level " " vs Swiss Italian ‹ ›; Swiss German drops ß → ss. Swiss broadcast subtitling for SRF/RTS/RSI/RTR is produced centrally by SWISS TXT, with no public RTS/RSI-specific numeric rulebook.

---

## Key Findings

1. The numeric "golden" values are conventions from professional bodies and academic literature (Ivarsson & Carroll 1998; Karamitroglou 1998; SUBTLE 2023), not regulation. They cluster but do not perfectly agree.
2. EBU R110 / EBU-TT family govern **file formats and carriage only** — they set no editorial reading-speed, line-length, or duration figures. Cite Ofcom/ITC/BBC/RAI/Netflix for editorial timing.
3. The single largest practical change in the field is the **rise in line length and speed** — "a rise from 32 to 42 characters per line … and faster (from 12 to 17–20 cps)" (Szarkowska & Gerber-Morón, PLOS ONE 13(6):e0199331, 2018).
4. Dialogue-dash and quotation-mark handling are the most error-prone areas for automation because they branch by standard **and** by language/region.

---

## Details

### 1. Anchor standards and authority

**English anchor — BBC Subtitle Guidelines, v1.2.3, June 2024** (maintained on GitHub at bbc.github.io/subtitle-guidelines). Consolidates former Ofcom/ITC and BBC documents; serves as the basis for all BBC subtitle work — prepared and live, online and broadcast. Delivery: EBU-TT Part 1 (with STL embedded) for broadcast; EBU-TT-D for online-only.

**German anchor — Untertitel-Standards von ARD, ORF, SRF, ZDF, Version 1.3, April 2015** (untertitelrichtlinien.de). Agreed by the nine ARD Landesrundfunkanstalten plus ARD Text, ORF (Austria), SRF (Switzerland) and ZDF as the common editorial basis for the German-speaking area; individual broadcasters add house style guides — e.g. the SWISS TXT / Access Services Zürich "Styleguide der UT-Redaktion Zürich 2018."

**Other standards compared:** Netflix Timed Text Style Guide (general requirements + ~36 language-specific guides); EBU R110 and EBU-TT / EBU-TT-D (Tech 3350 / 3380 / 3264); Ofcom Code and ITC Guidance (UK); Code of Good Subtitling Practice (Ivarsson & Carroll 1998, endorsed by ESIST); Karamitroglou's "Proposed Set of Subtitling Standards in Europe" (1998); SUBTLE "Recommended Quality Criteria for Subtitling" (Jan 2023); RAI "Norme e convenzioni editoriali essenziali" (v1.3, June 2021); CSA/Arcom "Charte relative à la qualité du sous-titrage" (Dec 2011, 16 criteria).

**Scoping note on EBU:** EBU R110 ("Subtitling on Digital TV and Online Services," rev. 2023) recommends _which technical formats to use_ (IMSC Text Profile of TTML, optionally EBU-TT-D, for DVB-TTML / HbbTV / DVB-DASH). EBU-TT (Tech 3350) and EBU-TT-D (Tech 3380) are XML interchange/distribution formats; EBU STL (Tech 3264) is the legacy binary format. None prescribe editorial timing. EBU-TT's "intended reading speed (wpm)" is an **author-set metadata field**, not a recommended value.

### 2. Timing: duration, gaps, lead-in/out, synchronisation

| Parameter                   | BBC (English anchor)                                        | ARD/ORF/SRF/ZDF (German anchor)                                   | Netflix TTSG                                                               | Ivarsson & Carroll (1998) | Karamitroglou (1998)                 |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| **Minimum duration**        | ~0.3 s/word (≈1.2 s for a 4-word sub)                       | 1 second                                                          | 5/6 s (20 frames @24fps; 25 @29.97)                                        | 1 second                  | 1.5 s (single word)                  |
| **Maximum duration**        | ~6 s typical; 3-liner up to ~8 s                            | longer allowed (e.g. music)                                       | 7 seconds                                                                  | 7 s (except songs)        | ~6 s (two-line); 3.5 s (single line) |
| **Min gap between subs**    | error if <0.8 s; warn 0.8–1.5 s; pause gaps ideally 1–1.5 s | 1 frame (may be omitted in live)                                  | 2 frames (all frame rates); 3–11 frame gaps closed to 2 in 24fps           | 4 frames                  | ~¼ s (≈6 frames)                     |
| **Lead-in vs speech onset** | sync to audio                                               | synchronous to image/sound; up to 1 s early if reading time tight | within 3 frames of audio; up to 12 frames past audio end for reading speed | follow speech rhythm      | ¼ s after onset                      |
| **Lag-out after speech**    | never >2 s after words                                      | —                                                                 | up to 12 frames past audio end                                             | —                         | max 2 s after utterance              |

**Reading-speed basis:** BBC 160–180 WPM (≈15 CPS), i.e. 0.33–0.375 s/word. ARD/ORF/SRF/ZDF base value 13–15 CPS (SWISS TXT 15 CPS; respeaking 20 CPS); children's down to 12 CPS. The **"six-second rule"** (a full two-line subtitle ≈6 s) corresponds to roughly 140–150 WPM / 12 CPS.

### 3. Shot changes / scene cuts

- **Principle (all standards):** subtitles should respect cuts and avoid straddling a cut. BBC: many subtitles start on the first frame of a shot and end on the last.
- **BBC:** if a subtitle ends before or starts after a shot change, leave ≥1 s (preferably 1.5 s) between subtitle and cut; avoid subtitles that straddle a cut; merge speech across two shots if one shot is too short to read.
- **Netflix red/green zones (24fps):**
  - **Green zone (8–11 frames from cut):** move in-time/out-time to ≥12 frames from the cut.
  - **Red zone (≤7 frames from cut):** snap in-time/out-time to the cut (out-times respecting the 2-frame gap).
  - One subtitle before + one after a cut: the second starts on the cut, the first ends 2 frames before it.
  - Subtitles may not cross scene changes except where a speaker begins before the cut and continues into the next scene.
- **SWISS TXT:** a subtitle may begin on the cut and must end at latest 2 frames before the next cut; may cross cuts _within_ a scene if it stays clear who speaks; if crossing, appear 1 s before and remain 1 s after the cut; in-time may close to within 12 frames of the cut if reading time requires.
- **RAI:** if a subtitle's in/out falls within **20 frames** of a scene change, snap to the change; may shift up to **25 frames** when the mouth is not visible.
- **"Two-frame rule":** the 2-frame minimum gap (Netflix) is sometimes conflated with cut handling; some legacy specs end 2 frames before and begin 2 frames after a cut (4 event-free frames total). Karamitroglou: subtitles should disappear before cuts that mark a _thematic_ change; ordinary shot/pan/zoom changes need not affect duration.

### 4. Reading speed (CPS / WPM) — full comparison

| Standard                     | Adult                                  | Children                       | Notes                                                                                                                                                       |
| ---------------------------- | -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BBC**                      | 160–180 WPM (~15 CPS)                  | slower / heavily edited        | viewers often prefer verbatim; rate may match programme pace                                                                                                |
| **ITC (1999, historic)**     | ≤140 WPM (180 with add-ons)            | 70–80 WPM (pre-lingually deaf) | source of the famous "140 WPM" figure                                                                                                                       |
| **Ofcom (2006–pre-2024)**    | 160–180 WPM; >200 too fast             | slower                         | speed targets **scrapped** in 2024 revision (now outcome-based)                                                                                             |
| **ARD/ORF/SRF/ZDF**          | 13–15 CPS                              | down to 12 CPS                 | SWISS TXT 15 CPS; respeaking 20 CPS                                                                                                                         |
| **Netflix (most languages)** | 17 CPS                                 | 13 CPS                         | + up to ~30% tolerance                                                                                                                                      |
| **Netflix (English)**        | 20 CPS                                 | 17 CPS                         | English-specific                                                                                                                                            |
| **SUBTLE (2023)**            | 12–15 CPS / 150–180 WPM; max 16–17 CPS | extra time on short subs       | professional ceiling below Netflix                                                                                                                          |
| **RAI**                      | 15 CPS (live cap)                      | +≥30% reading time             | ≤6 s max live latency                                                                                                                                       |
| **Academic optimum**         | ~12 CPS / **144 WPM**                  | —                              | Romero-Fresco, citing Díaz Cintas (2003), sets the recommended speed at "144 wpm (12 cps)" via the six-second rule (_Quaderns. Rev. Trad._ 20, 2013, p.203) |

**The live debate (rising speeds vs comprehension).** The historical norm of 32 CPL / 12 CPS has risen to 42 CPL / 17–20 CPS: "modern viewers are presented with subtitles that are longer than before (a rise from 32 to 42 characters per line) and faster (from 12 to 17–20 cps)" (Szarkowska & Gerber-Morón, PLOS ONE 13(6):e0199331, 19 Jun 2018). The time-budget argument against high speeds is quantified by Jan Pedersen (via Nimdzi): "if the reading speed is 12 characters per second (cps), the viewer spends 50% of the time reading subtitles and 50% watching the movie. If the reading speed is 16.5 cps the viewer spends 80% of the time reading the subtitles." Counter-evidence: Szarkowska & Gerber-Morón (PLOS ONE 2018) tested 74 English/Polish/Spanish viewers at 12/16/20 CPS and found "most viewers could read the subtitles as well as follow the images, coping well even with fast subtitle speeds … The absolute reading time was longest in the 12 cps condition, whereas the proportional reading time was highest in the 20 cps condition." A later eye-tracking study (Szarkowska et al., Macquarie Multimodal Language Processing Lab; 31 native English speakers at 12/20/28 CPS) found "around 20% of the subtitle words were not read at 20 cps, and 25% at 28 cps," concluding "subtitle speed below 20 cps is preferable for documentary videos." Platforms also exceed their own caps in practice: Garcarz/Szarkowska et al., "Subtitling standards across borders" (_Perspectives_, accepted 16 May 2025; online 2 Jun 2025) report Netflix's mean reading speed at 16.53 CPS with "a relatively high proportion (26%) of subtitles exceed[ing] the 20 CPS threshold … attributed to … Netflix's policy of allowing subtitles to exceed the standard threshold by up to 30%" (Amazon Prime mean 14.47 CPS, ~20% over 20 CPS; one Prime outlier 40.47 CPS).

### 5. Line treatment

- **Max lines:** 2 (consensus — BBC, ARD/SRF, Netflix, Karamitroglou, Ivarsson & Carroll). BBC allows 3 if no important picture information is obscured; BBC adds up to 3 lines guidance for 9:16 vertical video. Single-line subtitle sits on the **bottom** line.
- **Max chars/line:** BBC online = 68% of 16:9 width / 90% of 4:3 (not a fixed count; broadcast historically 37; ITC 32–34); **ARD/SRF = 37**; **Netflix = 42** (Latin scripts); Karamitroglou ≈35; academic SDH ≈35–37; SUBTLE 34–50.
- **Line balancing — a genuine divergence:** Netflix prefers **bottom-heavy** two-line subtitles (longer line on the bottom; avoid one or two words alone on top). Ivarsson & Carroll prefer the **upper line shorter** (to keep image free and reduce eye movement in left-justified subs). Pick per target standard.

### 6. Line breaks and segmentation

**Consensus (BBC, Netflix, Ivarsson & Carroll):** break at logical/syntactic points; keep grammatical units together; each subtitle ideally syntactically self-contained; prioritise editing and timing over line breaks where they conflict (BBC).

**Netflix explicit rules:**

- Break **after** punctuation marks.
- Break **before** conjunctions and before prepositions.
- Do **not** split: article from noun; adjective from noun; first name from last name; subject pronoun from verb; prepositional verb from its preposition; verb from auxiliary / reflexive pronoun / negation.
- When splitting a sentence across subtitles, segment at clause level so each reads fluently.

### 7. Punctuation

- **Ellipsis (U+2026):** Netflix uses the single character; do **not** use ellipsis/dash when one sentence simply continues across consecutive subtitles (pause <2 s). Use an ellipsis for a pause ≥2 s or trail-off; no ellipsis at the start of the continuation subtitle. BBC: three dots for a pause within a sentence (no following space); two dots before a second sentence in special cases (e.g. one-sided phone calls). Karamitroglou (older convention): "sequence dots" at end + "linking dots" at start of a continued sentence.
- **Interruption:** Netflix English uses two hyphens for an abrupt interruption by action/sound/other speaker.
- **Dialogue dashes (two speakers, one subtitle) — major divergence:**

| Standard                                           | Convention                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Netflix English                                    | hyphen, **no space**, max one speaker per line; each line a contained sentence                                                                    |
| Netflix French / Italian / Spanish / Thai / Polish | hyphen **with a space**                                                                                                                           |
| Netflix Brazilian Portuguese                       | hyphen, no space                                                                                                                                  |
| BBC                                                | colour-code speakers **preferred**; fallback = **white dash (not hyphen)** before _each_ piece of speech, each on its own line (legacy technique) |
| French CSA/Arcom (2011)                            | **systematic dash at every speaker change** (mandatory)                                                                                           |
| German ARD / SWISS TXT                             | **Spiegelstrich** on the second speaker's line when the same colour is used                                                                       |

- **Em-dash vs en-dash/hyphen:** BBC specifies a _white dash_ distinct from a hyphen. French dialogue tradition uses the em-dash (—) at each new speaker turn.
- **French spacing:** non-breaking space before `: ; ! ?` and inside guillemets (« texte »). Netflix French: space before `!`/`?`, space before and after `:`/`;`, space before `%` and currency. (None of this applies to French Canadian.)
- **Lyrics punctuation (Netflix):** only `?` and `!` at end of lyric lines; commas allowed within a line; no periods; capitalize each line.

### 8. Position and placement

- **Default:** bottom-centred (BBC, ARD/SRF, Netflix, Karamitroglou). A single-line subtitle occupies the bottom line.
- **Top placement** when bottom would obscure on-screen text/graphics, or for specific formats (ARD/SWISS TXT: sport, "SRF Börse" stock ticker → top). Netflix: raise to top to avoid clashes; Japanese permits vertical positioning.
- **Margins (Karamitroglou):** lowest line ≥1/12 of screen height above bottom; ≥1/12 of screen width margin each side.
- Avoid covering burned-in text/inserts (ARD: _Einblendungen_ should remain free; subtitle can be shifted up or sideways).

### 9. Typography

- **Font:** sans-serif — Helvetica/Arial (Karamitroglou); Tiresias (ITC digital); system fonts Helvetica (iOS)/Roboto (Android) for BBC online; wide fonts (Reith Sans, Verdana, Tiresias) recommended for _authoring_ to avoid reflow. ARD/SRF: always double-height (teletext).
- **Italics:** off-screen/voice-over; foreign language; songs; electronic-media voices (phone/TV/radio/GPS/AI); emphasis. Netflix: do **not** italicize speaker IDs/sound effects, proper names/vessel names, or dictionary loan-words.
- **Capitalization:** mixed case; ALL CAPS = shouting (avoid for emphasis). Netflix forced-narrative on-screen text = ALL CAPS (except long passages → sentence case); SDH speaker IDs/sound effects = title case in brackets, never all caps for emphasis. SWISS TXT emphasis = letter-spacing (_Sperrung_) with two spaces flanking the spaced word.

### 10. SDH / closed captions specifics

- **Speaker identification:**
  - _Colours_ — ARD/SRF: white, yellow, cyan, green on a black box; avoid red and blue (poor legibility), avoid magenta if possible; white-on-blue for editorial notes (e.g. imprint). Same colour for two speakers in one subtitle → Spiegelstrich.
  - BBC: colour-coding (white for most speakers; yellow/cyan/green for distinct speakers; green as a "floater" for minor characters who never co-appear).
  - Netflix SDH: square brackets, title case, used when the speaker is not visible.
  - RAI 5-colour system: **bianco, ciano, verde, magenta, giallo** (yellow shared among speakers without a dedicated colour); non-human/animated speakers use a separate background palette; narrator in children's programmes = white-on-blue.
  - French CSA: white = visible speaker; yellow = off-screen speaker (plus colours for other functions).
- **Sound effects:**
  - ARD/SRF: white on black, framed by two asterisks `* Donner *`; full sentences punctuated normally.
  - Netflix: square brackets, **present tense** `[door slams]`, title case.
  - RAI: **yellow background, blue text, centred, initial capital, no final stop**; in `.srt` web version → square brackets, uppercase, no colour.
  - CSA: punctuation of sound cues varies by channel.
- **Music / songs:**
  - ARD/SRF: first subtitle `*Titel/Interpret*` (or mood description), then `#` at the start of each lyric subtitle; for two singers, both lines start with `#` and the second carries a Spiegelstrich.
  - Netflix: ♪ at start **and** end of each sung subtitle (space between note and text); italicize lyrics; song titles in quotes; duet → ♪ on each line.
  - RAI: `#` + space opens sung text, opens each continuing sung subtitle, closes only the final sung line.
  - ITC/BBC: `#` (ITC digital: replace with a musical-note symbol).
- **Paralinguistic / manner of speech:** ARD/SRF parenthetical, in the speaker's colour `(flüstert)`, `(Mann)`; full sentences in parentheses take no end punctuation. SWISS TXT "WER-WIE-WAS" (who-how-what) rule; `(Mit französischem Akzent) …` if speech follows, `* Sie spricht französisch. *` if not.
- **Inaudible/silent:** SWISS TXT `* Nicht hörbare Stimmen *`, `* Stumme Szene *`.
- **Don't spoil:** ARD — colour must not pre-reveal the murderer; do not reveal who is knocking if unseen. Provide the same knowledge a hearing viewer has, not more.
- **No superfluous subtitles** for self-explanatory visuals/graphics (ARD).

### 11. Language-specific & Swiss conventions (only documented, real differences)

#### German

- **Quotation marks:** Germany/Austria use „…" (low–high, "99–66") or »…« (reversed guillemets). **Swiss German uses «…»** (guillemets, points outward), set tight or with a thin space, and does **not** use the low–high form. Swiss federal texts mandate guillemets; German marks are not permitted.
- **ß → ss:** Germany/Austria use ß; **Switzerland and Liechtenstein use ss universally** (sanctioned by reformed orthography §25 E2: "In der Schweiz kann man immer 'ss' schreiben"; phased out of Swiss schools by the 1930s; NZZ dropped it in 1974). So _Strasse_ not _Straße_. Netflix transliterates _Torstraße_ → _Torstrasse_.
- **Number grouping:** SWISS TXT groups thousands with an apostrophe (1'400, 18'350); German practice uses a period or thin space (1.400 / 1 400). (Years, postcodes and ID-numbers ungrouped.)
- **Dialect:** ARD/SRF translate dialect to Hochdeutsch with a parenthetical note; Swiss productions retain Helvetisms in dialect/own-production formats.
- **Numbers spelled out:** ARD/SRF spell out 1–12; use figures with time/measurement units.

#### French

- **Quotation marks:** « … » (guillemets) at first level. France/Belgium/Canada insert a non-breaking space inside (« texte »). **Swiss Romand uses «…» with a thin non-breaking space, or none if unavailable** (tight). Second level: France/Canada use " " (or ‹ ›); **Swiss Romand uses ‹ › (single guillemets).**
- **Spacing before high punctuation (`: ; ! ?`):** France = non-breaking space (a full word-space before the colon specifically). **Swiss Romand = thin non-breaking space before _all_ doubles including the colon**, omitted entirely if a thin space is unavailable (as in Canada).
- **CSA/Arcom (Dec 2011 Charte, 16 criteria):** systematic dash at speaker change; ≤12 CPS; max 2 lines; colour code (white = visible speaker, yellow = off-screen, red = sound, magenta = music, cyan = inner voice/narration, green = foreign language); respect shot changes; SDH in original language.
- **Number grouping:** French 20 000 / Swiss 20'000 (never 20,000).

#### Italian

- **Quotation marks:** « » (caporali) at first level, tight (no internal space). Second level: Italy uses " " (alte doppie). **Swiss Italian uses ‹ › (single low guillemets) for nested quotes — the one clearly documented Swiss-Italian divergence.** Switzerland uses « » uniformly across German, French, Italian and Romansh.
- **Spacing:** Italian is tight `«testo»` — identical to Swiss Italian; both differ from French `« texte »`. (No Swiss-Italian/Italy spacing difference exists; the contrast is with French.)
- **RAI SDH (v1.3, 2021):** 5-colour system; `#` for songs; yellow-background/blue-text sound effects; semicolon not permitted; comma never at subtitle end; straight double quotes for citations; ≈35–37 CPL (academic value — the RAI document defines max characters via the EBU STL GSI field, not a verbatim figure); Televideo page 777 (IT) / 778 (EN); 25 fps; live cap 15 CPS, ≤6 s latency; children's reading time +≥30%.
- **Netflix Italian:** numbers 1–10 spelled out, 11+ numeric, spelled at sentence start; metric conversion; 24-hour times with colon; bottom-heavy lines; honorific "Signore" alone, "Signor X" with surname.

#### Swiss broadcast structure

SWISS TXT (an SRG SSR service unit) produces subtitles **centrally** for SRF (German), RTS (French), RSI (Italian) and RTR (Romansh) — over ~80% of TV airtime (>22,200 h/year for SRF). No public RTS- or RSI-specific numeric style guide was located; the only documented numeric parameter is a **maximum 3-second** live-subtitle delay (speech recognition). The SRF/SWISS TXT Zürich styleguide (2018) gives 37 CPL, 15 CPS (respeaking 20), 2-frame minimum gap, 1 s minimum duration, and white/yellow/cyan/green colours. Any relationship to RTS/RSI is one of **shared central production**, not separately published rulebooks. (RSI teletext subtitles: page 700/777; live respeaking introduced by SWISS TXT in 2008.)

### 12. Additional spotting topics

- **On-screen text / forced narratives (FN):** subtitle plot-pertinent on-screen text. Netflix FN: ALL CAPS (except long passages → sentence case), no italics, no end period (except long passages), never combined with dialogue in one event; dialogue takes precedence when both coincide; redundant FNs deleted; FN duration mimics on-screen text duration.
- **Songs/lyrics:** subtitle if plot-pertinent and rights granted; opening/ending theme songs only if clearly plot-relevant (e.g. children's content) or for SDH. Capitalize each line; lyric end-punctuation only `?`/`!`.
- **Numbers/abbreviations:** spell 1–10 (Netflix) or 1–12 (ARD/SRF/SWISS TXT); figures above; spell out a number at sentence start; acronyms without periods; ARD/SRF abbreviate units/currencies only when preceded by a numeral.
- **Profanity/censorship — convergent principle, divergent execution:** BBC: "Do not edit out strong language unless it is absolutely impossible to edit elsewhere in the sentence – deaf or hard-of-hearing viewers find this extremely irritating and condescending"; if bleeped, BBC writes the word "BLEEP" in caps, in a contrasting colour, without an exclamation mark. Netflix: "Dialogue must never be censored. Expletives should be rendered as faithfully as possible"; if dipped/bleeped, Netflix masks with asterisks (e.g. f*\*\*), matching the count. ARD: *Schimpfwörter und Kraftausdrücke\* retained verbatim.
- **Frame rate / timecode:** Netflix — "half a second" = 12 frames @24fps, 15 @30fps, 30 @60fps; the **2-frame minimum gap is constant across all frame rates**; min duration 20 frames @24fps / 25 @29.97. SMPTE 12M timecode HH:MM:SS:FF; **drop-frame** (semicolon delimiter, NTSC 29.97fps) skips frame-_numbers_ 0 and 1 each minute except minutes divisible by 10 (≈108 frame-numbers/hour; no actual frames dropped) to track wall-clock; **non-drop** (colon) drifts ~3.6 s/hour fast. BBC EBU-TT uses non-drop at 25fps (PAL); RAI/PAL = 25 fps teletext. Mismatching DF/NDF captions desyncs progressively.
- **Reading-speed exceptions:** songs, music, on-screen text; Netflix marketing/supplemental assets may exceed standard CPS to preserve punchlines/taglines.
- **Dual-language / pivot:** Netflix pivot templates bridge unusual language pairs (e.g. Japanese→English pivot→Polish); follow the target-language TTSG plus pivot rules.
- **File formats:** EBU-TT Part 1 / STL (broadcast); EBU-TT-D / IMSC Text Profile (online, per EBU R110); TTML1 `.xml`/`.ttml` (Netflix; Japanese = IMSC1.1 `.xml`); SRT / WebVTT (general); EBU STL Tech 3264 (legacy; RAI `.stl` with GSI fields). UTF-8 encoding; Netflix restricts to its Glyph List (v2).

---

## Recommendations

**Staged implementation for automated tooling:**

1. **Stage 1 — target profile selection.** Branch on delivery target: _BBC/Ofcom_ (UK broadcast/online), _Netflix_ (streaming), _ARD/SWISS TXT_ (German-language broadcast), _RAI_ (Italian broadcast), _CSA/Arcom_ (French broadcast). Load that profile's numeric constants.
2. **Stage 2 — hard timing constants.** Enforce: 2-frame minimum gap (constant across frame rates); duration window 5/6 s–7 s (streaming) or 1 s–6 s (broadcast); close 3–11 frame gaps to 2 frames at 24fps (Netflix); flag gaps <0.8 s as errors (BBC). Implement red zone (≤7 frames → snap to cut) and green zone (8–11 frames → ≥12 frames) for streaming targets.
3. **Stage 3 — reading-speed gate.** Default CPS cap 17; English-streaming 20; children 13; broadcast/SDH 15. **Benchmark that changes behaviour:** for accessibility-first output (SDH, children), cap at 12–13 CPS (Romero-Fresco/RAI); for adult English streaming, allow up to 20 CPS but auto-flag any event >17 CPS for human review (the SUBTLE professional ceiling and the Macquarie "below 20 cps preferable" finding both sit here).
4. **Stage 4 — per-locale typography.** Branch quotation marks and spacing by locale **and Swiss variant** (detect `de-CH`, `fr-CH`, `it-CH`): apply ß→ss for `de-CH`; «…» tight for Swiss German and Swiss Italian; ‹ › nesting for Swiss Romand and Swiss Italian; thin-space punctuation for Swiss Romand. Apply dialogue-dash rule per the table in §7. **Do not invent Swiss distinctions where none are documented** (e.g. Swiss-Italian internal spacing equals Italy's — tight).
5. **Stage 5 — validation.** Validate online output against EBU-TT-D technical constraints; verify SDH speaker-ID/sound-effect bracket formatting and that no all-caps appears outside FN/SDH rules.

**Thresholds that should change the chosen rule set:** if the audience shifts to deaf/hard-of-hearing or children → drop CPS cap to 12–13 and lengthen minimum durations; if delivering to a regulator that has updated its code (e.g. Ofcom post-2024) → switch from fixed WPM targets to synchronisation/latency outcome checks.

---

## Caveats

- **Ofcom dropped explicit WPM targets in its 2024 revision** (now outcome-based). "140 WPM" is the 1999 ITC figure; "160–180 WPM" is the 2006–2023 Ofcom figure. Do not present either as the current Ofcom rule.
- **EBU sets no editorial timing numbers** — R110 and EBU-TT are about formats/carriage only.
- **RAI's official 2021 document** specifies 15 CPS (live) and frame-based rules but **no explicit CPL** in its text (defined via the EBU STL GSI field); the "35–37 CPL" is the academic value.
- **No public RTS/RSI-specific numeric subtitle standard** was located; Swiss subtitling is centralised via SWISS TXT, and the only published numeric parameter is the 3-second live-delay maximum.
- **The exact date Netflix moved English to 20 CPS** is not pinned to a public changelog (attested by Pedersen's 2018 study and current through 2026).
- **Romero-Fresco (~12 CPS / 144 WPM optimum, image-time argument) and Szarkowska (viewers cope with 20 CPS, though proportional reading time rises) are distinct positions**, not a single "12 CPS is best" consensus.
- **Many "consensus" numbers** (six-second rule, 4-frame gap, ~35 CPL) originate in academic/trade literature (Ivarsson & Carroll, Karamitroglou, SUBTLE), not regulation, and are conventions rather than law. CPS/WPM are imperfect proxies that ignore lexical complexity, font and image load.
- **Two genuine internal conflicts to resolve per project:** line balancing (Netflix bottom-heavy vs Ivarsson & Carroll top-shorter) and dialogue-dash style (no-space vs with-space vs each-line) — neither has cross-standard consensus.
