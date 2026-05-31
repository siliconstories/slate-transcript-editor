# Building Blocks for a Semantic Subtitle Generation Pipeline: A Preliminary Research Document

## TL;DR

- **You can build this entire pipeline from mature, mostly-permissively-licensed open-source pieces, but you must split it cleanly: PHP orchestrates and does SRT/VTT I/O; spaCy (Python) does the linguistically-aware line-breaking; an OpenAI-compatible LLM call does the semantic condensing.** No single library does the whole job, and the LLM step is the only thing that genuinely solves dialogue shortening — traditional NLP does not.
- **The architecture splits along your two hosting targets:** on genuine shared hosting, run PHP-only with in-browser JS NLP (compromise.js/wink-nlp) as the fallback line-breaker and remote LLM API calls done synchronously; on a Hetzner-style VPS, run a containerized Python/spaCy FastAPI microservice plus a job queue, with the LLM pointed at either a remote API or a local Ollama/vLLM endpoint via the OpenAI-compatible standard.
- **The honest quality ranking for line-breaking is: spaCy (dependency parse + NER) > pysbd/rule-based > Whisper/WhisperX greedy width-packing > compromise.js/wink-nlp in the browser.** For condensing, only an LLM produces acceptable results; extractive summarizers (sumy/TextRank) produce stilted, unusable dialogue and are not recommended.

## Key Findings

1. **SRT/VTT generation is a solved, trivial problem in all three languages.** Use `mantas-done/subtitles` (PHP), `srt` or `pysubs2` (Python), and `subtitle.js` or `subsrt-ts` (JS). These are thin, well-tested format libraries — pick by which runtime owns the final write step.
2. **Cue grouping from word timestamps is best borrowed from the Whisper ecosystem.** stable-ts's composable `regroup()` engine (MIT) is the most reusable reference, but all ASR-native segmenters share one flaw: they maximize words-per-line rather than break at natural points.
3. **spaCy is the right engine for intelligent line-breaking, and there is concrete prior art** — Glenn Langford's `subwisp.py` and the Apache-2.0 VideoLingo project both demonstrate spaCy dependency-parse + NER segmentation that avoids splitting names, noun phrases, and clauses.
4. **CPS enforcement is simple arithmetic** (chars ÷ duration), but the professional rulebook behind it (Netflix, BBC, TED) is what makes output look professional. Subtitle Edit (GPL-3.0) is the canonical reference implementation of these rules.
5. **Semantic condensing is fundamentally an LLM task.** There is a genuine gap in the ecosystem: almost every open-source "LLM subtitle" tool does translation, not monolingual CPS-driven condensing. You will write this step yourself as a prompt.
6. **Model-agnostic LLM access is best achieved with the OpenAI-compatible API standard itself**, not necessarily a heavy abstraction layer. LiteLLM (Python) and LLPhant (PHP) are the framework options; a thin `openai-php/client` pointed at a custom `base_url` is the lightweight option.
7. **In-browser playback is mature:** native `<track>` for simple VTT, Vidstack/Plyr for styled players, and JASSUB/SubtitlesOctopus (libass via WASM) when you need fully-styled ASS/SSA rendering.

## Details

### Building Block 1 — SRT/WebVTT generation and formatting from cue objects

This layer converts an array of `{start, end, text}` cue objects into a valid `.srt` or `.vtt` file. It is the least risky part of the pipeline.

**PHP (preferred for your LAMP backend):**

- **`mantas-done/subtitles`** (GitHub: mantas-done/subtitles; Packagist: `mantas-done/subtitles`). Language: PHP. Converts and edits SRT, VTT, ASS, SSA, STL, SBV, SUB, DFXP, TTML, and more. Its internal representation is a simple PHP array of `['start' => float_seconds, 'end' => float_seconds, 'lines' => [...]]`, which is exactly the cue-object shape you want. API is trivial: `(new Subtitles())->add(0, 5, ['line 1', 'line 2'])->save('out.srt')`. It also performs validation (overlapping timestamps, negative times, over-long durations). The package was auto-updated as recently as late 2024 (Packagist last-update timestamp 2024-10-28). **License: flag this** — some Packagist mirrors report "Unknown License"; verify the LICENSE file in the repo before commercial use. This is the single best fit for a PHP-owned write step.
- **`captioning/captioning`** and **`snikch/captions-php`** are older alternatives; captions-php offers a fluent `Captions_Caption` builder with `->text()->start()->end()` and shift/fast-forward helpers, but it is less actively maintained than mantas-done.

**Python (for the spaCy microservice path):**

- **`srt`** (srt.readthedocs.io; PyPI `srt`, by Chris Down). A tiny, focused library: `Subtitle(index, start: timedelta, end: timedelta, content)` objects plus `srt.compose()` and `srt.parse()`. Robust against malformed files. Ideal if Python owns the final write.
- **`pysubs2`** (GitHub: tkarabela/pysubs2). **License: MIT.** Production/Stable; latest **v1.8.1 released March 2026**, zero dependencies, Python 3.9+. Reads/writes SRT, SSA/ASS, MicroDVD, WebVTT, TTML, SAMI, and OpenAI Whisper captions. Supports shifting, restyling, and format conversion while preserving ASS styles/positions. This is the better choice if you ever need ASS output (for JASSUB playback) — it is exactly what the PySubtrans project uses internally.
- **`pysrt`** is the older standby (used by many tutorial scripts) but `srt`/`pysubs2` are cleaner.

**JavaScript (for in-browser assembly/fallback):**

- **`subtitle.js`** (GitHub: gsantiago/subtitle.js; npm `subtitle`). TypeScript, stream-based, SRT + partial WebVTT, maintained since 2015. Clean `{type:'cue', data:{start, end, text}}` node model and a `formatTimestamp()` helper.
- **`subsrt-ts`** (npm `subsrt-ts`, the maintained TypeScript fork of `subsrt`). Zero dependencies, supports SUB/SRT/SBV/VTT/SSA/ASS/SMI/LRC/JSON, with `build(captions, {format})` and `convert()`. Good for a pure-frontend export button.
- **`@vidstack/captions`** (~5kB) parses and renders VTT/SRT/SSA and works server-side too.

### Building Block 2 — Word-level-timestamp → cue grouping/segmentation

This step decides which words go together into one cue. The Whisper ecosystem is the richest source of reusable logic.

- **OpenAI Whisper** (GitHub: openai/whisper; MIT) added `--max_line_width` (default 42), `--max_line_count`, and `--max_words_per_line` (v20231105), all requiring `--word_timestamps True`. **Known limitation, well-documented in Whisper Discussion #314:** the algorithm greedily maximizes words/characters per line rather than breaking at natural grammatical points — producing mid-sentence full stops and split names. This is the central reason a spaCy or LLM layer is needed downstream.
- **WhisperX** (GitHub: m-bain/whisperX; BSD). Very fast batched inference — per the project README, "⚡️ Batched inference for 70x realtime transcription using whisper large-v2... 🪶 faster-whisper backend, requires <8GB gpu memory for large-v2 with beam_size=5." It adds wav2vec2 forced alignment (≈±50ms word timing vs ±500ms in vanilla Whisper) plus diarization. **Two caveats:** (1) per the README, alignment fails on "Transcript words which do not contain characters in the alignment models dictionary" (e.g. "2014" or "£13.60"), which appear without timestamps; the workaround is `--suppress_numerals`. (2) v3+ produces very long segments and has no built-in natural line-breaking.
- **stable-ts** (GitHub: jianfch/stable-ts). **License: MIT;** active (~v2.19.1 in 2026). Its `regroup()` is the most reusable cue-grouping engine: a chainable, config-as-string pipeline of composable operations — `split_by_gap` (`sg`), `split_by_punctuation` (`sp`), `split_by_length` (`sl`), `split_by_duration` (`sd`), `merge_by_gap` (`mg`), `merge_by_punctuation` (`mp`), `clamp_max` (`cm`), `lock` (`l`), etc. The default `regroup=True` expands to a clamp → split-by-punctuation → split-by-gap → merge-by-gap → split-by-punctuation chain. Still gap/punctuation-driven, not syntax-aware, but the cleanest reusable substrate.
- **Reusable CPS-aware reference:** the `dashed/whisperx-subtitles-replicate` approach uses **pysbd** for sentence segmentation, then merges/splits cues by duration, line length, line count, and a desired reading speed (words/sec) with min/max cue durations and a max merge gap (~1.5s). This is the closest open reference for the full "group + enforce CPS" loop.

### Building Block 3 — Intelligent line-breaking / spotting at linguistically sensible points

This is where spaCy earns its place as your preferred engine, and where the strongest professional prior art exists.

**Why spaCy:** spaCy's `DependencyParser` jointly learns sentence segmentation and labelled dependency parsing using an arc-eager transition system with a "break" transition. The dependency parse lets you identify clause boundaries, conjunctions, and noun-phrase spans, so you can break _after_ punctuation, _before_ conjunctions and prepositions, and never split an article from its noun or a first name from a last name. Its NER lets you protect named entities (people, cities, brands) from being split. spaCy also offers a faster statistical `SentenceRecognizer` (`senter`) and a rule-based `Sentencizer` if you don't want to load the full parser.

**Concrete prior art (mine these):**

- **`subwisp.py`** by Glenn Langford (GitHub gist `a2b24ffd92c832c60e1b1b49da1a8b27`; referenced in Whisper Discussion #314 and whisperX Issue #829). Run as `python3 -m subwisp input.json > output.srt`. It (1) segments the transcript into complete sentences, (2) uses spaCy POS tagging + dependency parsing + the `Matcher` to find candidate break points (detecting clause boundaries triggered by prepositions/verbs and conjunction breaks), (3) uses spaCy NER plus an optional external named-entity data file to avoid splitting names/noun phrases/city names, and (4) falls back to a length-fitting break only when no good grammatical break exists. Defaults: `max_line_count=2`, `max_line_width=42`, inspired explicitly by BBC and Netflix guidelines. **Caveats:** English-only, works only on vanilla Whisper JSON (not WhisperX), enforces no minimum display time / CPS / gaps, **no stated license (so default "all rights reserved")** — use it as a logic reference, not a dependency. Author considers it an abandoned prototype.
- **VideoLingo** (GitHub: Huanshere/VideoLingo). **License: Apache 2.0;** very active — ~16.5k–16.7k GitHub stars and ~1.7k–1.8k forks as of spring 2026, with latest release **v3.0.1 (28 Feb 2026)** adding RTX 50-series/Blackwell support (PyTorch 2.8.0 / whisperX 3.8.1). Its pipeline does WhisperX transcription → **NLP + LLM sentence segmentation** → summarization/translation → **cutting and aligning long subtitles** → single-line Netflix-style output, and runs fully local via Ollama. The best end-to-end reference architecture for semantic segmentation, even though its condensing is a side effect of single-line + dubbing-length constraints rather than explicit CPS enforcement. Study its `st.py` pipeline and `step5_splitforsub.py`.

**Rule-based alternative — pysbd** (GitHub: nipunsadvilkar/pySBD; from the NLP-OSS Workshop / EMNLP 2020 paper by Sadvilkar & Neumann). Rule-based sentence boundary disambiguation for 22 languages. Per the paper, "PySBD passes 97.92% of the Golden Rule Set examplars for English, an improvement of 25% over the next best open source Python tool" (the next-best, blingfire, scored 75.00% on the Golden Rule Set). It handles abbreviations/decimals/legal-medical edge cases that trip up naïve splitters, and is faster and lighter than loading a spaCy model — a good first-pass before spaCy's parse, or the whole segmenter on shared hosting if spaCy is unavailable.

**Professional conventions to encode (mine Subtitle Edit for these):**

- **Subtitle Edit** (GitHub: SubtitleEdit/subtitleedit; **GPL-3.0**, C#; v4.x actively released into 2026). The desktop GUI is GPL-3.0 — **do not copy its code into a non-GPL product** — but its documented behavior is a goldmine: single-line max length default 43 chars, configurable max number of lines, CPS coloring (red when over the cap), "do-not-break-after" lists per language (so you never break after an article or abbreviation), and "Merge short lines" logic. **Note the licensing nuance:** the separate **`subtitleedit-cli`** (the `seconv` converter) is **LGPL-3.0**, which permits linking from non-GPL software, and ships a Dockerfile — usable as a containerized format/conversion sidecar on the VPS path.
- The academic backing: Gerber-Morón & Szarkowska's eye-tracking study (_Journal of Eye Movement Research_, 2018, DOI 10.16910/jemr.11.3.2) found that non-syntactically-segmented subtitles induced higher cognitive load (though comprehension scores did not differ significantly), empirically supporting the rule of keeping syntactic units intact across line breaks.

### Building Block 4 — Reading-speed / CPS enforcement

CPS = (characters in cue) ÷ (cue duration in seconds). Enforcement means: if a cue exceeds the cap, either extend its end time (into available gap), merge with a neighbor, or — if neither works — flag it for condensing (Block 5).

**The numeric rulebook (consensus across professional guidelines):**

- **Netflix Timed Text Style Guide (English USA):** 42 characters per line, maximum 2 lines. Per Netflix's General Requirements, "Minimum duration: 5/6 (five-sixths) of a second per subtitle event... Maximum duration: 7 seconds per subtitle event." Reading-speed caps are 20 CPS (adult) / 17 CPS (children) in the English (USA) guide; most other-language Netflix guides use 17 CPS (adult) / 13 CPS (children) — pick the figure that matches your target language. Line-break rules: break after punctuation, before conjunctions, before prepositions; never separate an article from its noun, an adjective from its noun, or a first name from a last name.
- **BBC Subtitle Guidelines (v1.2.3, June 2024):** "The recommended subtitle speed is 160-180 words-per-minute (WPM) or 0.33 to 0.375 second per word" (180 WPM ≈ 15 CPS in English). The BBC requests line length not exceed 37 characters for broadcast (online uses 68% of a 16:9 frame width); max 2 lines (3 allowed if no picture info is obscured); break at logical/punctuation points; "well-edited text and timing are more important than line-breaks" when they conflict.
- **TED / IWSLT benchmark:** 42 chars/line, 84 chars total, max 2 lines, 21 CPS cap, duration ~1.12s–7s, balanced line lengths but linguistic units take priority over balance.
- **General/EBU consensus:** ~42 chars/line, 2 lines, ~15–17 CPS, with professional Dutch/Scandinavian practice targeting ~11 CPS optimal and 15–17 CPS maximum.

**Tools:** Subtitle Edit (reference logic, GPL), `pyasstosrt` (ASS→SRT conversion), and any of the format libraries above let you compute CPS directly. There is no need for a heavyweight dependency here — it's arithmetic plus the merge/extend heuristics borrowed from the dashed/whisperx-subtitles reference.

### Building Block 5 — Semantic shortening / condensing of dialogue

**Be clear with implementers: this is an LLM/paraphrase task, and traditional NLP does not solve it well.** Extractive summarizers (sumy, TextRank, LexRank, LSA) _select_ existing sentences by frequency/centrality — they cannot rewrite "Excuse me, do you maybe know what time it is?" into "What time is it?". Research on spoken-conversation summarization (e.g. the Topic-aware Pointer-Generator work, arXiv 1910.01335) confirms that sentence-level extractive approaches are "ill-suited" for dialogue because key information is at the sub-utterance level, scattered across turns, amid false starts and hesitations. Extractive output for dialogue is stilted and drops the conversational meaning — **not recommended.**

**The honest state of the ecosystem:** there is a real gap — nearly every open-source "LLM subtitle" tool does _translation_, not monolingual condensing. You will implement this step as a custom prompt: feed the LLM the over-CPS cue text plus a target character/CPS budget and instruct it to preserve meaning and tone while shortening. Reference projects that show the prompt-engineering patterns (batching, 1:1 line correspondence enforcement, structured timestamp handling):

- **machinewrapped/llm-subtrans** / **PySubtrans** (`pip install pysubtrans`). Open source; very active into 2026; supports any OpenAI-compatible endpoint including local LM Studio/Ollama, OpenRouter, DeepSeek. Uses pysubs2 internally. Author caveat: small/quantized local models produce poor results and can loop.
- **Cerlancism/chatgpt-subtitle-translator** demonstrates a structured timestamp mode and strict 1:1 input/output line enforcement to protect timing — directly applicable to condensing.
- **rockbenben/subtitle-translator** (MIT, 2025) shows the critical architectural pattern: extract timecodes/cue numbers/headers locally and send only dialogue text to the model so timing can never be corrupted.

**Note on "LLM compression" literature:** 2024–2026 papers on "context compression" are about reducing inference token cost, NOT rewriting dialogue to fit reading speed — do not conflate them. The CPS-condensing task remains a custom prompt job.

### Building Block 6 — In-browser subtitle playback/rendering

- **Native `<track>` element:** zero-dependency, plays VTT directly in any HTML5 `<video>`. SRT must be converted to VTT first (trivial: change `,` to `.` in timestamps, add `WEBVTT` header). Best for the shared-hosting minimal path.
- **Plyr** (GitHub: sampotts/plyr; MIT). Simple, accessible HTML5 player with WebVTT caption support via `<track>` and a `captions` API. **Note:** Plyr is being deprecated/archived in favor of Vidstack; the maintainer recommends migrating.
- **Vidstack** (GitHub: vidstack/player; MIT). The modern successor to Plyr/Vime; framework-agnostic, with its own ~5kB captions parser/renderer supporting VTT, SRT, and SSA. Recommended for a styled custom player.
- **video.js** with **vtt.js**: the long-standing, heavily-deployed option; vtt.js is the WebVTT parser/renderer.
- **JASSUB** (npm `jassub`) and **JavascriptSubtitlesOctopus** (GitHub: libass/JavascriptSubtitlesOctopus): both wrap **libass** compiled to WASM to render fully-styled ASS/SSA subtitles on a canvas via Web Workers (so the UI doesn't lag). JASSUB is the more modern, threaded, hardware-accelerated successor; SubtitlesOctopus is used in production by Crunchyroll and forked by Jellyfin. Use these only if you need ASS styling (karaoke, positioning, fonts) — for plain two-line SRT they are overkill. **Note libass licensing:** libass is ISC-licensed, but check the specific WASM build's bundled fonts/dependencies.

### Building Block 7 — Model-agnostic LLM abstraction layers

The single most important insight: **the OpenAI-compatible `/v1/chat/completions` API is now the de-facto standard**, and Ollama, vLLM, LM Studio, LocalAI, llama.cpp's server, Together, and Fireworks all expose it. Model-agnosticism is often achievable by just changing `base_url` and `api_key`.

- **LiteLLM** (GitHub: BerriAI/litellm). Python SDK + proxy server giving one OpenAI-format interface to 100+ providers (OpenAI, Anthropic, Bedrock, Vertex, Ollama, vLLM, etc.), with fallback chains, load balancing, cost tracking, and virtual keys via a YAML config. Ideal on the VPS path as a central gateway when you want provider failover and spend control. **Contrarian caveat:** competing-gateway vendor blogs (treat their latency numbers as marketing) consistently flag LiteLLM's Python/GIL latency overhead, exact-match-only caching in the OSS version, and missing auth/RBAC/audit in the open-source build. For a pipeline that just calls chat completions, it can be over-engineered.
- **LLPhant** (GitHub: LLPhant/LLPhant; **MIT**; PHP 8.1+). A LangChain-inspired PHP GenAI framework supporting OpenAI, Anthropic, Mistral, Ollama, LM Studio, and any OpenAI-compatible/LocalAI endpoint. Built on top of the openai-php SDK. The natural "framework" choice if your PHP backend wants RAG/embeddings/agents too — heavier than you need for pure condensing.
- **`openai-php/client`** (GitHub: openai-php/client; **MIT**). The de-facto community PHP OpenAI SDK; works against any OpenAI-compatible base URL via `OpenAI::factory()->withBaseUri(...)`. **This is the lightweight, recommended choice for your PHP backend** — point it at a remote API or a local Ollama/vLLM server with one config change.
- **`ArdaGnsrn/ollama-php`** (MIT): a dedicated PHP Ollama client if you go local-only.
- **Python:** the official `openai` SDK with `base_url` set to a local server is the lightest option; LangChain is an orchestration framework, not a model-access layer, and is over-engineered for this task.

### Reference architectures that already chain several steps

- **VideoLingo** (Apache 2.0) — the strongest end-to-end reference: WhisperX → NLP+LLM segmentation → translate → cut/align → single-line output, local via Ollama. Study its `st.py` pipeline and `step5_splitforsub.py`.
- **machinewrapped/llm-subtrans / PySubtrans** — reference for batching, project-state persistence, and OpenAI-compatible-endpoint abstraction (incl. local).
- **Subtitle Edit (GPL-3.0)** — reference for the professional rulebook: auto-break, CPS coloring, do-not-break-after lists, merge-short-lines.
- **The Dmitrii Lukianov "Subtitle Engineering" write-up** documents building a full STT → forced alignment → LLM-refinement → readable-segmentation pipeline in both cloud and local variants.

## Recommendations

**Stage 1 — Define the cue-object contract first (do this before any code).** Standardize on a single JSON cue shape: `{index, start_ms, end_ms, lines: [string]}`. Every building block reads and writes this. This is what lets human and agentic coders compose the blocks independently.

**Architecture A — "Shared-hosting minimal" (no Python, no Docker, no workers):**

- PHP backend with `mantas-done/subtitles` for all SRT/VTT I/O.
- Line-breaking in the **browser** via **compromise.js** or **wink-nlp** (both run client-side; per the winkjs/wink-nlp README, winkNLP "processes raw text at ~650,000 tokens per second with its wink-eng-lite-web-model" — benchmarked on Ch. 13 of _Ulysses_ on an M1 MacBook Pro with 16GB RAM — with POS, sentence boundary detection, and NER in ~10kB gzipped, and ~95% POS accuracy on a WSJ subset). **Be honest about quality:** these lack true dependency parsing (compromise explicitly notes it does not do dependency parsing), so line-breaks will be noticeably worse than spaCy — acceptable for a budget tier, not for professional output.
- CPS enforcement as PHP arithmetic + merge/extend heuristics.
- Condensing via **synchronous** remote LLM calls from PHP using `openai-php/client`. **Critical constraint:** shared hosts have short PHP execution timeouts and often block long-running/background processes, so process cue-by-cue or in small batches within one request, and cache aggressively. Outbound API calls may time out — set conservative timeouts and degrade gracefully (keep the un-condensed cue if the call fails).
- Playback via native `<track>` or Plyr/Vidstack.
- **Threshold to leave this tier:** if you need professional-grade line-breaking, multilingual support, or local/private LLM inference, move to Architecture B.

**Architecture B — "VPS full-power containerized" (Hetzner-style):**

- PHP (Apache/MySQL) remains the orchestrator and user-facing API.
- **spaCy in a containerized FastAPI microservice** exposed over HTTP on localhost; PHP calls it with the cue-object JSON and gets back linguistically-broken cues. FastAPI is the right choice (async, Pydantic validation, auto-docs). Containerize it so the heavy spaCy model loads once and stays warm.
- A **job queue** (e.g. Redis + a PHP or Python worker) for long transcripts, since LLM condensing of a full film is too slow for a synchronous request.
- LLM access via **LiteLLM as a local gateway** OR a thin `openai-php`/official-`openai`-SDK client pointed at **Ollama/vLLM** for local inference or a remote API — model choice becomes a config value.
- Optionally use **subtitleedit-cli (LGPL-3.0) as a containerized conversion sidecar**.
- Mine **VideoLingo** for the segmentation+LLM orchestration logic and **Subtitle Edit** for the CPS/break rulebook.
- **Threshold to scale further:** if throughput becomes the bottleneck, dedicate a GPU to vLLM for condensing and keep spaCy on CPU.

**Architecture C — "PHP-shells-out-to-Python CLI" (middle ground for a single VPS without container orchestration):**

- PHP `proc_open()`/`shell_exec()` calls a Python CLI script (the spaCy segmenter, e.g. a hardened `subwisp.py`-style tool) passing JSON via stdin and reading SRT/JSON from stdout.
- Simpler than a microservice (no HTTP server, no port management) but pays the Python+model startup cost on every invocation — acceptable for low volume, not for high concurrency. Move to Architecture B's warm microservice when per-request latency from cold model loading becomes painful.

**On licensing — act on these flags:** prefer the MIT/permissive pieces (`srt`, `pysubs2`, `openai-php/client`, LLPhant, Vidstack, stable-ts, VideoLingo's Apache-2.0). Treat **Subtitle Edit (GPL-3.0)** strictly as a logic/behavior reference, not a code source, unless your product is GPL. Verify `mantas-done/subtitles`' license file directly. Do not vendor `subwisp.py` (no license); reimplement its logic.

## Caveats

- **The line-breaking quality ranking (spaCy > pysbd > Whisper-greedy > browser JS) is a synthesis of how each tool works, not a single benchmarked head-to-head;** validate on your own content before committing a tier.
- **No maintained open-source library does CPS-driven semantic condensing** — you are building this, and its quality depends entirely on prompt engineering and model choice. Small local/quantized models produce poor condensing and can loop (per the llm-subtrans author).
- **Shared hosting is genuinely hostile to this pipeline's heaviest steps:** no Python/spaCy, short timeouts, blocked background workers, and unreliable outbound API calls. The "minimal" tier is a real compromise on quality, not a like-for-like alternative.
- **WhisperX cannot timestamp numerals** without `--suppress_numerals`, and `subwisp.py` does not accept WhisperX JSON directly — budget integration work if you standardize on WhisperX upstream.
- **Star counts and "active" status reflect spring 2026 snapshots** and will drift; re-check maintenance before adopting any dependency.
- Some figures (e.g. LiteLLM latency numbers, the Netflix CPS variation by language) come from third-party or competing-vendor sources, or vary by document version, and should be treated as approximate/directional — confirm against the live source guideline before encoding a hard threshold.
