# Rev AI JSON Format — Complete Reference

> Compiled 2026-05-30 from the live Rev AI docs (`https://docs.rev.ai/api/features`
> and the surrounding API reference). Rev AI API version **v1**.
> Authoritative timing field is **`end_ts`** — see [Gotchas](#9-cheat-sheet--gotchas).

This document describes **every JSON shape Rev AI produces or consumes**: the
core transcript format, streaming messages, captions, the NLP "insight" APIs
(topic / sentiment / language-id / forced-alignment), translation &
summarization, and the supporting job / webhook / error / account objects. The
final appendix maps the transcript format onto this editor's internal DPE shape.

---

## Table of contents

1. [Overview & mental model](#1-overview--mental-model)
2. [The core Transcript JSON](#2-the-core-transcript-json--the-format)
3. [Streaming JSON (WebSocket messages)](#3-streaming-json-websocket-messages)
4. [Captions output (SRT / VTT)](#4-captions-output-srt--vtt)
5. [NLP / insight API outputs](#5-nlp--insight-api-outputs)
6. [Job, webhook, error & account objects](#6-job-webhook-error--account-objects)
7. [Submission options that change the output](#7-submission-options-that-change-the-output)
8. [Features → JSON cross-reference](#8-features--json-cross-reference)
9. [Cheat sheet & gotchas](#9-cheat-sheet--gotchas)
10. [Appendix: mapping Rev AI → this editor's DPE format](#10-appendix-mapping-rev-ai--this-editors-dpe-format)

---

## 1. Overview & mental model

Rev AI is a family of REST/WebSocket APIs, all versioned `v1`:

| API                         | Base URL                                   | Produces                                                           |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Asynchronous Speech-to-Text | `https://api.rev.ai/speechtotext/v1`       | **core Transcript JSON**, captions, plaintext                      |
| Streaming Speech-to-Text    | `wss://api.rev.ai/speechtotext/v1/stream`  | streaming `partial`/`final` messages (+ persisted Transcript JSON) |
| Topic Extraction            | `https://api.rev.ai/topic_extraction/v1`   | `{ topics: [...] }`                                                |
| Sentiment Analysis          | `https://api.rev.ai/sentiment_analysis/v1` | `{ messages: [...] }`                                              |
| Language Identification     | `https://api.rev.ai/languageid/v1`         | `{ top_language, language_confidences }`                           |
| Forced Alignment            | `https://api.rev.ai/alignment/v1`          | **core Transcript JSON** (re-timed)                                |

**The single most important takeaway:** one schema — the **monologues /
elements** transcript — is shared by Async STT, Forced Alignment, Translation,
and the persisted output of a Streaming session. Learn it once (§2) and you can
read the output of most of the platform.

**Authentication.** All requests send the access token. Most APIs use a header
`Authorization: Bearer <REVAI_ACCESS_TOKEN>`; **Language Identification** and
**Forced Alignment** additionally accept the token as an `access_token` query
parameter.

**Job lifecycle (async & NLP).**

```
POST  /jobs                      → { id, status: "in_progress", ... }
GET   /jobs/{id}                 → poll status   (or use a webhook)
        status: transcribed | completed | failed
GET   /jobs/{id}/transcript      → core Transcript JSON   (STT, alignment)
GET   /jobs/{id}/result          → insight JSON           (topic, sentiment, language-id)
```

Polling is discouraged in production; prefer webhooks (`callback_url` /
`notification_config`, see §6).

---

## 2. The core Transcript JSON (THE format)

Retrieved via `GET /jobs/{id}/transcript` with
`Accept: application/vnd.rev.transcript.v1.0+json` (the default; `text/plain`
returns a plain transcript instead).

### 2.1 Top-level shape

```json
{
  "monologues": [
    {
      "speaker": 0,
      "elements": [
        /* ... */
      ]
    },
    {
      "speaker": 1,
      "elements": [
        /* ... */
      ]
    }
  ]
}
```

- The root object has exactly one property: **`monologues`**, an ordered array.
- **Null properties are omitted** throughout Rev AI responses — absent ≠ null.

### 2.2 The `monologue` object

| Field                       | Type           | Notes                                                                                                                |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `speaker`                   | integer        | Diarized speaker id, **0-based**. With `skip_diarization: true` the entire transcript collapses to a single speaker. |
| `speaker_info`              | object \| null | Present only when `speaker_names` was supplied (human transcriber) and a name was matched; otherwise omitted/null.   |
| `speaker_info.id`           | integer        | Speaker id (mirrors `speaker`).                                                                                      |
| `speaker_info.display_name` | string         | Human-readable name, e.g. `"Jane Doe"`.                                                                              |
| `elements`                  | array          | Ordered transcript elements (next section).                                                                          |

### 2.3 The `element` object

| Field        | Type                                 | Present on | Notes                                                                                                      |
| ------------ | ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `type`       | `"text"` \| `"punct"` \| `"unknown"` | all        | `unknown` = the ASR could not resolve the spoken word.                                                     |
| `value`      | string                               | all        | The word (`"Hello"`), a spacing/punctuation char (`" "`, `"."`), or an inaudible marker (`"<inaudible>"`). |
| `ts`         | number \| null                       | `text`     | Start time in **seconds**, centisecond precision, relative to audio start.                                 |
| `end_ts`     | number \| null                       | `text`     | End time in seconds. **Field name is `end_ts`** (not `ts_end`).                                            |
| `confidence` | number \| null                       | `text`     | Confidence in `[0, 1]`. **`null` for `punct` and `unknown`.**                                              |

### 2.4 Structural rules (where integrators trip)

- **`punct` elements carry no timing and no confidence.** They serve _two_
  roles: the single-space separators _between_ words **and** sentence
  punctuation (`.`, `,`, `?`, `…`). A space is itself a `punct` element with
  `value: " "`.
- **Reconstructing text:** concatenate every `value` in order to get a
  faithful rendering (spaces and punctuation included). To get _words_, take the
  `text` elements; treat `punct` as glue/separators.
- **`skip_punctuation: true`** removes `punct` elements entirely from the JSON
  (including the spaces). Plaintext output still delimits words with spaces.
- **`unknown` elements have no `ts`/`end_ts`** — anything that needs per-word
  timing must skip or specially handle them.
- Elements within a monologue are time-ordered; consecutive monologues are
  ordered by the first spoken element of each.

### 2.5 Example — diarization + punctuation + an inaudible word

```json
{
  "monologues": [
    {
      "speaker": 1,
      "elements": [
        { "type": "text", "value": "Hello", "ts": 0.5, "end_ts": 1.5, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "World", "ts": 1.75, "end_ts": 2.85, "confidence": 0.8 },
        { "type": "punct", "value": "." }
      ]
    },
    {
      "speaker": 2,
      "elements": [
        { "type": "text", "value": "monologues", "ts": 3, "end_ts": 3.5, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "are", "ts": 3.6, "end_ts": 3.9, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "a", "ts": 4, "end_ts": 4.3, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "block", "ts": 4.5, "end_ts": 5.5, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "of", "ts": 5.75, "end_ts": 6.14, "confidence": 1 },
        { "type": "punct", "value": " " },
        { "type": "unknown", "value": "<inaudible>" },
        { "type": "punct", "value": " " },
        { "type": "text", "value": "text", "ts": 6.5, "end_ts": 7.78, "confidence": 1 },
        { "type": "punct", "value": "." }
      ]
    }
  ]
}
```

### 2.6 Example — same audio with `skip_punctuation: true`

No `punct` elements at all (spaces gone); `unknown` is still emitted:

```json
{
  "monologues": [
    {
      "speaker": 1,
      "elements": [
        { "type": "text", "value": "Hello", "ts": 0.5, "end_ts": 1.5, "confidence": 1 },
        { "type": "text", "value": "World", "ts": 1.75, "end_ts": 2.85, "confidence": 0.8 }
      ]
    },
    {
      "speaker": 2,
      "elements": [
        { "type": "text", "value": "monologues", "ts": 3, "end_ts": 3.5, "confidence": 1 },
        { "type": "text", "value": "are", "ts": 3.6, "end_ts": 3.9, "confidence": 1 },
        { "type": "text", "value": "a", "ts": 4, "end_ts": 4.3, "confidence": 1 },
        { "type": "text", "value": "block", "ts": 4.5, "end_ts": 5.5, "confidence": 1 },
        { "type": "text", "value": "of", "ts": 5.75, "end_ts": 6.14, "confidence": 1 },
        { "type": "unknown", "value": "<inaudible>" },
        { "type": "text", "value": "text", "ts": 6.5, "end_ts": 7.78, "confidence": 1 }
      ]
    }
  ]
}
```

### 2.7 Multichannel grouping query parameters (newer)

For multichannel jobs (`speaker_channels_count > 1`), `GET …/transcript`
accepts two query parameters that reshape how interruptions split monologues:

| Param                         | Values                            | Effect                                                                                                                                                                                     |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `group_channels_by`           | `speaker` \| `sentence` \| `word` | `speaker`: all tokens of a speaker stay in one monologue. `sentence`: sentences stay intact even when interrupted. `word`: split per word on interruption (no overlap).                    |
| `group_channels_threshold_ms` | integer                           | Max delay (ms) between different speakers' tokens before splitting. Low → interruptions split sooner; high → ongoing phrases finish first. **Ignored when `group_channels_by = speaker`.** |

---

## 3. Streaming JSON (WebSocket messages)

Every streaming response is a text frame containing serialized JSON with a
`type` discriminator. The completed session's `final` hypotheses are _also_
retrievable later as the standard core Transcript JSON (§2) via the async
Get-Transcript endpoint.

| `type`        | When                                        | Carries                                       |
| ------------- | ------------------------------------------- | --------------------------------------------- |
| `"connected"` | Once, on handshake                          | `{ "type": "connected", "id": "<streamId>" }` |
| `"partial"`   | Continuously while audio streams            | best-guess so far; elements have `value` only |
| `"final"`     | When the AI is confident; frozen thereafter | full elements with timing + confidence        |

### 3.1 Response envelope

| Field      | Type   | Notes                                            |
| ---------- | ------ | ------------------------------------------------ |
| `type`     | string | `"partial"` or `"final"`                         |
| `ts`       | double | Start time of the hypothesis (s)                 |
| `end_ts`   | double | End time of the hypothesis (s)                   |
| `elements` | array  | Transcript elements (same element shape as §2.3) |

- **Partial** elements contain only `{ type: "text", value }` — **no** `ts`,
  `end_ts`, or `confidence` — _unless_ the connection sets
  `detailed_partials=true`, which surfaces those final-only values in partials
  (at a slight ~1% WER cost on the final hypothesis).
- **Final** elements are full: `text` elements carry `ts`/`end_ts`/`confidence`,
  and `punct` elements appear. ITN and punctuation are applied to **finals
  only**.
- Multiple partials can be emitted for the same segment and may change words
  before the final lands.

### 3.2 Example message sequence

```text
Client <-- Rev AI
{ "type": "connected", "id": "s1d24ax2fd21" }

Client <-- Rev AI
{ "type": "partial", "ts": 1.01, "end_ts": 1.55,
  "elements": [ { "type": "text", "value": "one" } ] }

Client <-- Rev AI
{ "type": "partial", "ts": 1.01, "end_ts": 2.2,
  "elements": [ { "type": "text", "value": "one" }, { "type": "text", "value": "tooth" } ] }

Client <-- Rev AI
{ "type": "final", "ts": 1.01, "end_ts": 3.2,
  "elements": [
    { "type": "text",  "value": "One", "ts": 1.04, "end_ts": 1.55, "confidence": 1.0 },
    { "type": "punct", "value": " " },
    { "type": "text",  "value": "two", "ts": 1.84, "end_ts": 2.15, "confidence": 1.0 },
    { "type": "punct", "value": "." }
  ] }
```

### 3.3 Connection parameters that change the output

Sent as query parameters on the WebSocket URL:

| Param                          | Default | Effect on output                                         |
| ------------------------------ | ------- | -------------------------------------------------------- |
| `detailed_partials`            | `false` | Adds `ts`/`end_ts`/`confidence` to **partial** elements. |
| `start_ts`                     | none    | Offsets every `ts`/`end_ts` by N seconds.                |
| `remove_disfluencies`          | `false` | Drops "ums"/"uhs" from partials **and** finals.          |
| `filter_profanity`             | `false` | Masks ~600 profanities (all but first/last char → `*`).  |
| `max_segment_duration_seconds` | none    | 5–30; caps wait between finals (±0.5 s).                 |
| `enable_speaker_switch`        | `false` | Speaker-switch detection within the stream.              |
| `skip_postprocessing`          | `false` | Skips ITN / casing / punctuation.                        |
| `language`                     | `en`    | Transcription language (see §7).                         |
| `custom_vocabulary_id`         | none    | Biases recognition toward supplied phrases.              |
| `priority`                     | `speed` | Tunes latency vs. accuracy.                              |

Connection essentials (not output-shaping): `access_token`, `content_type`
(e.g. `audio/x-raw;layout=interleaved;rate=16000;format=S16LE;channels=1`, or
`audio/x-flac;rate=16000`), `metadata`, `delete_after_seconds`,
`max_connection_wait_seconds`.

---

## 4. Captions output (SRT / VTT)

Captions are a transcript-_derived_ text format (not JSON), retrieved via
`GET /jobs/{id}/captions`. The format is chosen by the `Accept` header:

| Accept header          | Format       | Default    |
| ---------------------- | ------------ | ---------- |
| `application/x-subrip` | SubRip (SRT) | ✅ default |
| `text/vtt`             | WebVTT (VTT) |            |

- Query `speaker_channel` (integer) selects which channel to caption for
  multichannel jobs (default `null`, only valid when no `speaker_channels_count`
  was set).
- Translated captions: `GET /jobs/{id}/captions/translation/{language}` (same
  two formats; translation must have been requested at submission).

**SRT example**

```text
1
00:00:01,210 --> 00:00:04,840
Hello there, this is a example captions output

2
00:00:07,350 --> 00:00:10,970
Each caption group is in the SubRip Text
file format
```

**WebVTT example**

```text
WEBVTT

1
00:00:01.210 --> 00:00:04.840
Hello there,
this is an example captions output

2
00:00:07.350 --> 00:00:10.970
Each caption group is in the vtt
file format
```

---

## 5. NLP / insight API outputs

Each insight API takes a transcript (or audio) and returns its own result
schema. Submit to `POST /jobs`, then `GET /jobs/{id}/result` with the API's
vendor `Accept` header.

### 5.1 Topic Extraction

- Input: a **core Transcript JSON** wrapped as `{"json": <transcript>, "metadata": "..."}`. Max 14000 words.
- Job `type`: `topic_extraction`. Result `Accept`: `application/vnd.rev.topic.v1.0+json`.

```json
{
  "topics": [
    {
      "topic_name": "incredible team",
      "score": 0.9,
      "informants": [
        {
          "content": "We have 17 folks and, uh, I think we have an incredible team and I just want to talk about some things that we've done that I think have helped us get there.",
          "ts": 71.4,
          "end_ts": 78.39
        },
        {
          "content": "Um, it's sort of the overall thesis for this one.",
          "ts": 78.96,
          "end_ts": 81.51
        }
      ]
    }
  ]
}
```

| Field                        | Type   | Notes                        |
| ---------------------------- | ------ | ---------------------------- |
| `topics[].topic_name`        | string | Extracted topic phrase.      |
| `topics[].score`             | number | Relevance score.             |
| `topics[].informants[]`      | array  | Supporting transcript spans. |
| `informants[].content`       | string | The sentence/segment text.   |
| `informants[].ts` / `end_ts` | number | Span timing (s).             |

### 5.2 Sentiment Analysis

- Input: a **core Transcript JSON** as `{"json": <transcript>, "metadata": "..."}`. Max 14000 words.
- Job `type`: `sentiment_analysis`. Result `Accept`: `application/vnd.rev.sentiment.v1.0+json`.

```json
{
  "messages": [
    { "content": "Hi, my name's Jack Ratzinger.", "score": 0, "sentiment": "neutral", "ts": 0.27, "end_ts": 1.5 },
    {
      "content": "First, give a quick overview of what we're going to talk about.",
      "score": -0.601,
      "sentiment": "negative",
      "ts": 6.72,
      "end_ts": 8.79
    }
  ]
}
```

| Field                      | Type                                  | Notes                                                             |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `messages[].content`       | string                                | Segment text.                                                     |
| `messages[].score`         | number                                | **Intensity, not confidence.** Range `[-1, 1]`.                   |
| `messages[].sentiment`     | `positive` \| `neutral` \| `negative` | `score < -0.3` → negative; `> 0.3` → positive; otherwise neutral. |
| `messages[].ts` / `end_ts` | number                                | Segment timing (s).                                               |

### 5.3 Language Identification

- Input: **audio** via `{"source_config": {"url": "..."}, "metadata": "..."}`.
- Job `type`: `language_id`. Result `Accept`: `application/vnd.rev.languageid.v1.0+json`.

```json
{
  "top_language": "en",
  "language_confidences": [
    { "language": "en", "confidence": 0.907 },
    { "language": "nl", "confidence": 0.023 },
    { "language": "ar", "confidence": 0.023 },
    { "language": "de", "confidence": 0.023 },
    { "language": "cmn", "confidence": 0.023 }
  ]
}
```

| Field                               | Type   | Notes                        |
| ----------------------------------- | ------ | ---------------------------- |
| `top_language`                      | string | Most probable language code. |
| `language_confidences[].language`   | string | Candidate language code.     |
| `language_confidences[].confidence` | number | Confidence in `[0, 1]`.      |

### 5.4 Forced Alignment

Improves per-word timestamps for an existing transcript.

- Input: **audio + transcript text**: `{"source_config": {"url": "..."}, "source_transcript_config": {"url": "..."}, "metadata": "..."}`.
- Job `type`: `alignment`. Retrieved via `GET /jobs/{id}/transcript` with `Accept: application/vnd.rev.transcript.v1.0+json`.
- Output is the **core Transcript JSON** (§2) — but `text` elements carry
  `type`/`value`/`ts`/`end_ts` and **typically no `confidence`**.

```json
{
  "monologues": [
    {
      "speaker": 0,
      "elements": [
        { "type": "text", "value": "hi", "ts": 0.24, "end_ts": 0.48 },
        { "type": "text", "value": "my", "ts": 0.54, "end_ts": 0.66 },
        { "type": "text", "value": "name's", "ts": 0.66, "end_ts": 0.87 }
      ]
    }
  ]
}
```

---

## 6. Job, webhook, error & account objects

### 6.1 Job object

Returned by `POST /jobs` (subset) and `GET /jobs/{id}` (full). **Null
properties are omitted.**

```json
{
  "id": "Umx5c6F7pH7r",
  "status": "transcribed",
  "created_on": "2018-05-05T23:23:22.29Z",
  "completed_on": "2018-05-05T23:45:13.41Z",
  "duration_seconds": 356.24,
  "media_url": "https://www.rev.ai/FTC_Sample_1.mp3",
  "language": "en",
  "type": "async"
}
```

| Field                         | Type                                       | Notes                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | string                                     | Job id.                                                                                                                                                                                  |
| `status`                      | `in_progress` \| `transcribed` \| `failed` | NLP jobs use `completed` instead of `transcribed`.                                                                                                                                       |
| `created_on` / `completed_on` | string                                     | ISO-8601 UTC.                                                                                                                                                                            |
| `duration_seconds`            | number \| null                             | Media duration; null if media couldn't be retrieved.                                                                                                                                     |
| `name`                        | string                                     | Original filename, when available.                                                                                                                                                       |
| `media_url`                   | string                                     | Source URL (null for local-file uploads).                                                                                                                                                |
| `metadata`                    | string                                     | Echoed submission metadata (≤512 chars).                                                                                                                                                 |
| `language`                    | string                                     | Transcription language.                                                                                                                                                                  |
| `type`                        | string                                     | `async` \| `stream` \| `topic_extraction` \| `sentiment_analysis` \| `language_id` \| `alignment`.                                                                                       |
| `failure`                     | string \| null                             | See enum below.                                                                                                                                                                          |
| `failure_detail`              | string \| null                             | Human-readable reason + remedy.                                                                                                                                                          |
| _(echoed options)_            |                                            | `skip_diarization`, `skip_punctuation`, `filter_profanity`, `remove_disfluencies`, `custom_vocabulary_id`, `delete_after_seconds`, `speaker_channels_count`, `callback_url`, … when set. |

**`failure` enum:** `internal_processing`, `download_failure`,
`duration_exceeded`, `duration_too_short`, `invalid_media`, `empty_media`,
`transcription`, `insufficient_balance`, `invoicing_limit_exceeded`.

### 6.2 Webhook / notification callback

If a `callback_url` / `notification_config.url` is set, Rev AI POSTs the job
details when the job completes or fails. Body is `{ "job": { …Job… } }`.

```json
// On success
{
  "job": {
    "id": "Umx5c6F7pH7r",
    "status": "transcribed",
    "created_on": "2018-05-05T23:23:22.29Z",
    "callback_url": "https://www.example.com/callback",
    "duration_seconds": 356.24,
    "media_url": "https://www.rev.ai/FTC_Sample_1.mp3"
  }
}
```

```json
// On failure
{
  "job": {
    "id": "Umx5c6F7pH7r",
    "status": "failed",
    "created_on": "2018-05-05T23:23:22.29Z",
    "callback_url": "https://www.example.com/callback",
    "failure": "download_failure",
    "failure_detail": "Failed to download media file. Please check your url and file type"
  }
}
```

Delivery: Rev AI POSTs (not GET) to the URL. Reply **200** to acknowledge; a
non-200 triggers retries every 30 minutes for up to 24 hours.

### 6.3 Job list

`GET /jobs` returns a JSON **array of Job objects**, newest first, limited to
the last 30 days. Pagination: `limit` (page size) and `starting_after` (pass
the last job id from the previous page).

### 6.4 Error / problem-details (RFC 7807)

`4xx`/`5xx` errors return `application/problem+json`:

| Property   | Description                                          |
| ---------- | ---------------------------------------------------- |
| `type`     | URI identifying the error type.                      |
| `title`    | Short human-readable summary.                        |
| `detail`   | Occurrence-specific explanation.                     |
| `status`   | HTTP status code.                                    |
| _(extras)_ | e.g. `parameter`, `allowed_values`, `current_value`. |

```json
// 400 — validation
{
  "parameter": { "media_url": ["The media_url field is required"] },
  "type": "https://www.rev.ai/api/v1/errors/invalid-parameters",
  "title": "Your request parameters didn't validate",
  "status": 400
}
```

```json
// 409 — invalid job state
{
  "allowed_values": ["transcribed"],
  "current_value": "in_progress",
  "type": "https://rev.ai/api/v1/errors/invalid-job-state",
  "title": "Job is in invalid state",
  "detail": "Job is in invalid state to obtain the transcript",
  "status": 409
}
```

**Retryable:** `429`, `502`, `503`, `504` (cap non-429 retries at ~5).

### 6.5 Account

`GET /account`:

```json
{ "balance_seconds": 150, "email": "jay@rev.ai" }
```

---

## 7. Submission options that change the output

Every `POST /jobs` field that affects the resulting JSON (async STT). Defaults
shown where applicable; unset options are simply absent.

| Field                                                                              | Type                                           | Effect                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_config.url`                                                                | string                                         | Media download URL (modern form).                                                                                                               |
| `source_config.auth_headers.Authorization`                                         | string                                         | Optional auth header for the media URL (only `Authorization` allowed).                                                                          |
| `media_url`                                                                        | string                                         | Legacy alternative to `source_config`. Use one or the other.                                                                                    |
| `notification_config.url` (+ `.auth_headers`)                                      | object                                         | Webhook URL (modern form).                                                                                                                      |
| `callback_url`                                                                     | string                                         | Legacy webhook URL.                                                                                                                             |
| `metadata`                                                                         | string                                         | Echoed back (≤512 chars).                                                                                                                       |
| `delete_after_seconds`                                                             | integer                                        | Auto-delete N s after completion (0–2592000 = 30 days).                                                                                         |
| `transcriber`                                                                      | `machine` \| `human` \| `low_cost` \| `fusion` | `machine` (Reverb) is default; `low_cost` = Reverb Turbo; `fusion` = best rare-word accuracy; `human` = human transcribers (HIPAA-unsupported). |
| `verbatim`                                                                         | boolean                                        | Include false starts/disfluencies. Default `true` for `machine`, `false` for `human`.                                                           |
| `skip_diarization`                                                                 | boolean                                        | Single speaker for the whole transcript.                                                                                                        |
| `skip_punctuation`                                                                 | boolean                                        | Drop `punct` elements (incl. spaces) from JSON.                                                                                                 |
| `skip_postprocessing`                                                              | boolean                                        | Skip ITN/casing/punctuation (English & Spanish only).                                                                                           |
| `remove_disfluencies`                                                              | boolean                                        | Drop "ums"/"uhs" (also removes atmospherics unless `remove_atmospherics` set).                                                                  |
| `remove_atmospherics`                                                              | boolean                                        | Drop atmospherics (e.g. `<laugh>`).                                                                                                             |
| `filter_profanity`                                                                 | boolean                                        | Mask ~600 profanities.                                                                                                                          |
| `speaker_channels_count`                                                           | integer                                        | Transcribe N channels separately, each as one speaker (En/Es/Fr; ignores `skip_diarization`; billed ×N).                                        |
| `speakers_count`                                                                   | integer                                        | Hint for the known number of speakers (En/Es/Fr).                                                                                               |
| `diarization_type`                                                                 | `standard` \| `premium`                        | Diarization quality tier.                                                                                                                       |
| `custom_vocabularies[].phrases`                                                    | string[]                                       | Bias toward phrases (≤6000 phrases/job; ≤12 words each; ≤34 chars/word).                                                                        |
| `custom_vocabulary_id`                                                             | string                                         | Reuse a pre-submitted vocabulary (beta; mutually exclusive with `custom_vocabularies`).                                                         |
| `strict_custom_vocabulary`                                                         | boolean                                        | If true, only exact phrases (no per-word split).                                                                                                |
| `language`                                                                         | string                                         | ISO 639-1 code (see below).                                                                                                                     |
| `rush` / `test_mode` / `segments_to_transcribe[]` / `speaker_names[].display_name` | —                                              | Human-transcriber-only options (HIPAA-unsupported). `speaker_names` populates `speaker_info.display_name` in the transcript.                    |
| `summarization_config`                                                             | object                                         | `{ model: standard\|premium, type: paragraph\|bullets, prompt }` (`type` and `prompt` are mutually exclusive).                                  |
| `translation_config.target_languages[]`                                            | array                                          | `[{ language, model: standard\|premium }]`.                                                                                                     |

### 7.1 Summarization output

`GET /jobs/{id}/transcript/summary` — `Accept: text/plain` (default) or
`application/json`. `type: paragraph` returns prose; `type: bullets` returns a
topic list; a custom `prompt` returns Markdown.

### 7.2 Translation output

`GET /jobs/{id}/transcript/translation/{language}` returns the **core
Transcript JSON** (§2) in the target language (`Accept`:
`application/vnd.rev.transcript.v1.0+json` default, or `text/plain`). Translation
must have been requested at submission via `translation_config`.

**Translation target-language enum:** `en, en-us, en-gb, ar, pt, pt-br, pt-pt,
fr, fr-ca, es, es-es, es-la, it, ja, ko, de, ru`.

### 7.3 Supported transcription languages (`language`)

`en` (English, default) plus: `ar` Arabic, `bg` Bulgarian, `ca` Catalan, `cmn`
Mandarin (ISO 639-3), `cs` Czech, `da` Danish, `de` German, `el` Greek, `es`
Spanish, `fi` Finnish, `fr` French, `hi` Hindi, `hr` Croatian, `hu` Hungarian,
`it` Italian, `ja` Japanese, `ko` Korean, `lt` Lithuanian, `lv` Latvian, `ms`
Malay, `nl` Dutch, `no` Norwegian, `pl` Polish, `pt` Portuguese, `ro` Romanian,
`ru` Russian, `sk` Slovak, `sl` Slovenian, `sv` Swedish, `tr` Turkish. Also
region/multilingual variants `en-us`, `en-gb`, and multilingual English/Spanish
(`en/es`). One language per job. With non-English languages you may **not** use
`skip_punctuation`, `remove_disfluencies`, `filter_profanity`,
`speaker_channels_count`, or `custom_vocabulary_id`.

---

## 8. Features → JSON cross-reference

The six headline features on `docs.rev.ai/api/features`, mapped to the schema:

| Feature             | Submission control                                                            | Where it shows in the JSON                                                         |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Custom vocabularies | `custom_vocabularies` / `custom_vocabulary_id`                                | Affects `value` of `text` elements (better rare-word recognition).                 |
| Punctuation & ITN   | on by default; `skip_punctuation`, `skip_postprocessing`                      | `punct` elements; normalized `value`s ("June 20th, 2020"). Streaming: finals only. |
| Disfluency removal  | `remove_disfluencies`                                                         | Removes "um"/"uh" `text` elements.                                                 |
| Profanity filtering | `filter_profanity`                                                            | Masks `value`s (`f***`-style).                                                     |
| Timestamps          | on by default                                                                 | `ts` / `end_ts` on every `text` element.                                           |
| Speaker diarization | on by default; `skip_diarization`, `speaker_channels_count`, `speakers_count` | `monologues[].speaker` (+ `speaker_info` when named).                              |

---

## 9. Cheat sheet & gotchas

**Element-type capability matrix**

| `type`    | has `ts`/`end_ts` | has `confidence` | example `value` |
| --------- | ----------------- | ---------------- | --------------- |
| `text`    | ✅                | ✅ (`[0,1]`)     | `"Hello"`       |
| `punct`   | ❌                | ❌ (`null`)      | `" "`, `"."`    |
| `unknown` | ❌                | ❌ (`null`)      | `"<inaudible>"` |

**Accept header → output**

| Output               | Accept header                                        |
| -------------------- | ---------------------------------------------------- |
| Transcript JSON      | `application/vnd.rev.transcript.v1.0+json` (default) |
| Transcript plaintext | `text/plain`                                         |
| Captions SRT         | `application/x-subrip` (default)                     |
| Captions VTT         | `text/vtt`                                           |
| Topic result         | `application/vnd.rev.topic.v1.0+json`                |
| Sentiment result     | `application/vnd.rev.sentiment.v1.0+json`            |
| Language-id result   | `application/vnd.rev.languageid.v1.0+json`           |
| Summary              | `text/plain` (default) or `application/json`         |
| Errors               | `application/problem+json`                           |

**Gotchas**

- The timing field is **`end_ts`**, not `ts_end`. (Some stale OpenAPI mirrors
  show `ts_end`; the live API and current reference both use `end_ts`.)
- `punct` elements are **both** the inter-word spaces (`" "`) **and** sentence
  punctuation. They have no timing/confidence.
- `confidence` is **`null`** on `punct` and `unknown` elements.
- `speaker` is **0-based** (first speaker is `0`).
- `unknown` elements have **no `ts`/`end_ts`** — handle before time-indexing.
- `skip_punctuation: true` removes spaces too (in JSON output).
- **Null properties are omitted** from responses — test for presence, not null.
- Streaming **partials** lack timing/confidence unless `detailed_partials=true`.
- NLP jobs reach `status: "completed"`; STT jobs reach `"transcribed"`.

---

## 10. Appendix: mapping Rev AI → this editor's DPE format

`slate-transcript-editor` ingests Rev AI transcripts two ways. Both live under
`src/`.

### 10.1 DPE target shape

```js
{
  words:      [ { id, start, end, text } ],
  paragraphs: [ { id, start, end, speaker } ]
}
```

DPE contract (`src/util/dpe-to-slate`): a word belongs to a paragraph when
`word.start >= paragraph.start && word.end <= paragraph.end`. Rev AI elements
are time-ordered, so contiguous paragraph ranges fall out naturally.

### 10.2 Classic path — `src/util/rev-to-dpe/index.js`

`convertRevToDpe(revJson, { wordsPerParagraph = 40 })`:

- Each `text` element with finite `ts`/`end_ts` → a word
  `{ start: ts, end: end_ts, text: value }`.
- A **non-space `punct`** element glues onto the previous word
  (`"werden"` + `"."` → `"werden."`). Space `punct` (`" "`) is dropped.
- `speaker` → label `"Speaker " + (speaker + 1)` (0-based → 1-based display).
- Paragraphs close at the first sentence end (`/[.?!…]$/`) once the buffer
  reaches `wordsPerParagraph` (default 40), with a hard cap at ×1.5.

**Fields this path drops:** `confidence`, `speaker_info.display_name`, and any
`unknown` element (no `ts`/`end_ts`, so it never becomes a word).

### 10.3 Rigid / faithful path — `src/transcript-model/rev-overlay.js` + `rev-to-slate.js`

The "rev.ai sample (rigid / faithful)" fixture and the **Export rev.ai
(faithful)** button use this path (`rigid-profile.js`). It keeps the imported
transcript **immutable**, allowing only mute/rewrite (never add/split/merge), so
export reconstructs the Rev AI schema byte-faithfully:

- Projects directly from the immutable model's word list; each editable word
  carries a stable `_key` anchor back to its original element plus its
  `confidence` and trailing `punctAfter`.
- Word count per paragraph is **fixed** — anchors stay valid, so the round-trip
  is lossless (mute blanks a word's `value` on export; structure is preserved).

### 10.4 Recommended future-proofing

When extending Rev AI support here, consider wiring the fields the classic path
currently ignores:

- **`speaker_info.display_name`** → use real names instead of `"Speaker N+1"`
  (populated when a `human` job supplies `speaker_names`).
- **`confidence`** → low-confidence word highlighting (already preserved on the
  rigid path).
- **`unknown` elements** → render `<inaudible>` markers rather than silently
  dropping them; note they have no timing.
- **Streaming `final` messages** → identical element shape to §2, so the same
  importer can consume a live session's finals.

---

_End of reference._
