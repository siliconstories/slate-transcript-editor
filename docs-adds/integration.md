# Integrating `slate-transcript-editor` into another codebase

How to embed this editor — **this fork**, with word-level editing, word muting, and the
profile/tier system (classic free-text vs. rigid rev.ai faithful round-trip) — as a dependency
in a separate React application: how to install it, which props and functions are available,
the input data format, and how to combine it with your own CSS.

This fork has also been **modernized** to a current toolchain (React 19 · Slate 0.124 ·
MUI v9 + Emotion 11 · docx 9). The full toolchain story — phases, gotchas, merge runbook — lives
in [`modernization.md`](./modernization.md); this guide only covers consuming the package.

---

## 1. Which version are you using?

There are two different things with the same name:

|                                           | What it is                                                                                                                                      | Word-level editing / muting / rev.ai rigid tier? | Stack                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| **`npm install slate-transcript-editor`** | Pietro Passarelli's **upstream** package (`0.1.6-alpha.19`). `package.json` `repository`/`homepage` point at `pietrop/slate-transcript-editor`. | ❌ No                                            | React 16/17 · MUI v4 · Slate 0.59            |
| **This repo (fork)**                      | The local checkout you're reading.                                                                                                              | ✅ Yes                                           | React 19 · MUI v9 + Emotion 11 · Slate 0.124 |

Both still carry the version string `0.1.6-alpha.19`, but the code differs. If you want the
fork's features **or** its modern stack, **a plain `npm install slate-transcript-editor` will not
give them to you** — you must build and consume this fork (Section 3).

---

## 2. Stack & compatibility

The fork targets the modernized stack below. Versions are from this repo's `package.json`;
React/Slate-DOM are peers you must satisfy, everything else ships as a bundled dependency.

| Package                             | Version                     | Notes                                                                       |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| react / react-dom                   | peer `^18.2.0 \|\| ^19.0.0` | Developed and tested on **19.2.6**. 18.2+ is supported; **19 recommended**. |
| slate / slate-react                 | **0.124.1 / 0.124.2**       | Bundled.                                                                    |
| slate-dom                           | **0.124.1**                 | New required peer of `slate-react` 0.124 — bundled here.                    |
| slate-history                       | **0.113.1**                 | Bundled.                                                                    |
| @mui/material + @mui/icons-material | **9.0.1**                   | Bundled. Emotion-based (no more JSS).                                       |
| @emotion/react + @emotion/styled    | **11.14.x**                 | Bundled.                                                                    |
| docx                                | **9.7.1**                   | Word (`.docx`) export. Bundled.                                             |
| stt-align-node                      | **2.0.1** (pinned)          | Round-trip-critical — do **not** upgrade. Bundled.                          |
| Node                                | **≥ 20**                    | `engines.node`.                                                             |

> The component build (`build:component`) is still Babel → `dist/` (CommonJS). Only the **demo**
> and **Storybook** moved to Vite; that does not affect how you consume the package.

---

## 3. Installing the fork

The package is published from its built `dist/` folder (Babel transpiles `src/` → `dist/`,
CommonJS). There is **no root `index.js`** (only `src/index.js`), and **no build-on-install hook**
(the package's only `prepare` script runs `husky` to set up dev git hooks — it does **not** build
`dist/`). So a raw `npm install github:<you>/slate-transcript-editor` will not build and will fail
to resolve its entry point. **Build first, then install the build.**

### Step 1 — build the fork (in this repo)

```bash
npm install
npm run build:component        # babel src -> dist  (also copies package.json + README into dist)
cd dist && npm pack            # -> slate-transcript-editor-0.1.6-alpha.19.tgz
```

### Step 2 — install it in the consumer app

```bash
# from a packed tarball (recommended — reproducible, no duplicate-React risk):
npm install ../slate-transcript-editor/dist/slate-transcript-editor-0.1.6-alpha.19.tgz

# …or as a file: dependency in the consumer package.json:
#   "slate-transcript-editor": "file:../slate-transcript-editor/dist"
```

### Step 3 — provide React (the only peer dependency)

```bash
npm install react@19 react-dom@19      # or react@18 react-dom@18 (>= 18.2)
```

MUI v9, Emotion 11, Slate (+ `slate-dom`), and docx are declared in the package's
**`dependencies`**, so npm installs them for you when you install the tarball — you do **not**
hand-install them. The only thing the package leaves to you is **react / react-dom**, declared as
`peerDependencies` (`^18.2.0 || ^19.0.0`).

**Version constraints (important):**

- **React 19** is the developed/tested target; **18.2+** is supported via the peer range. Because
  react/react-dom are now declared `peerDependencies`, npm 7+ **warns** on a version mismatch
  (older builds of this fork couldn't — React was undeclared).
- **Slate 0.124** with the **new `slate-dom` peer** (required by `slate-react` 0.124). It's
  bundled, so you don't install it separately, but be aware a stray older `slate-dom` in your tree
  will break the editor.
- **MUI v9 + Emotion 11.** See the duplicate-MUI/Emotion caveat in Section 12.

**Duplicate-React warning:** installing the **tarball** is safe because the package does not
bundle its own React. If you instead use `npm link` (or sometimes `file:`) during development,
you can end up with two copies of React and hit `Invalid hook call`. Force a single copy:

```js
// webpack
resolve: { alias: { react: path.resolve('./node_modules/react'), 'react-dom': path.resolve('./node_modules/react-dom') } }

// vite (vite.config.js)
resolve: { dedupe: ['react', 'react-dom'] }   // or alias react/react-dom to one absolute path
```

The same dedupe advice applies to `@mui/material` and `@emotion/react` if your host app also
depends on them (Section 12).

### Optional: make the fork install cleanly without manual building

`react`/`react-dom` peers are already declared, so the only remaining gap for a
`npm install <git-or-registry>` to "just work" is a **build-on-install hook**: add a
`"prepack": "npm run build:component"` (or a build-running `prepare`; the current `prepare` only
runs husky), and/or publish to npm — `npm run publish:public` already builds `dist/` and runs
`npm publish dist --access public`. Renaming `name` to a scoped `@you/slate-transcript-editor`
lets you publish to a private registry without colliding with upstream.

---

## 4. Quick start

```jsx
import SlateTranscriptEditor from 'slate-transcript-editor';

export default function App() {
  return (
    <SlateTranscriptEditor
      transcriptData={dpeJson} // required — DPE JSON (Section 10)
      mediaUrl="https://example.com/clip.mp4" // required — audio or video URL
    />
  );
}
```

That's enough to render an editable transcript synced to the media. Everything else is opt-in,
and with no `profile` prop you get the original free-text DPE behavior.

---

## 5. What you can import

From the package entry (`src/index.js`):

```js
import SlateTranscriptEditor, {
  SlateTranscriptEditor, // same value as the default export

  // pure format utilities (Section 11) — usable WITHOUT rendering the component:
  convertDpeToSlate, // DPE JSON  -> Slate value
  converSlateToDpe, // Slate value -> DPE JSON   (note the name: "conver", not "convert")
  slateToText, // Slate value -> plain text
  secondsToTimecode, // number -> "hh:mm:ss:ff"
  shortTimecode, // number -> "hh:mm:ss"
  timecodeToSeconds, // "hh:mm:ss(:ff)" | "mm:ss" | number -> seconds

  // transcript profile / tier system (Section 9):
  resolveProfile, // (string | instance | nullish) -> profile instance
  detectProfile, // (parsedTranscript) -> matching profile instance (falls back to classic)
  getProfile, // (id) -> fresh profile instance | undefined
  registerProfile, // (descriptor) -> register your own tier
  createClassicProfile, // factory: free-text DPE profile instance
  createRigidProfile, // factory: rigid rev.ai faithful profile instance
} from 'slate-transcript-editor';
```

There is **no ref / imperative API** — the component does not use `forwardRef` or
`useImperativeHandle`. You drive it entirely through **props and callbacks**.

---

## 6. Props reference

Defined in `src/components/index.js` (`propTypes`; defaults applied via a `DEFAULT_PROPS` merge —
see the note below).

| Prop                    | Type             | Default              | Description                                                                                                                                                                                           |
| ----------------------- | ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcriptData`        | object           | — (**required**)     | DPE JSON: `{ words: [...], paragraphs: [...] }` (Section 10). For the rigid tier, pass the parsed rev.ai JSON.                                                                                        |
| `mediaUrl`              | string           | — (**required**)     | URL to the audio/video file.                                                                                                                                                                          |
| `profile`               | string \| object | classic              | Transcript tier (Section 9). `'classic'` (or omitted) = original free-text behavior; `'rigid'` = rev.ai faithful round-trip; or a profile instance.                                                   |
| `isEditable`            | bool             | `true`               | When `false`, the transcript is read-only.                                                                                                                                                            |
| `showTimecodes`         | bool             | `true`               | Show paragraph-level timecodes.                                                                                                                                                                       |
| `showSpeakers`          | bool             | `true`               | Show speaker labels.                                                                                                                                                                                  |
| `showTitle`             | bool             | `false`              | Show the `title`.                                                                                                                                                                                     |
| `title`                 | string           | —                    | Transcript title; also used to name exported files.                                                                                                                                                   |
| `followPlayback`        | bool             | `true`               | "Karaoke" mode — highlights the current word and auto-scrolls it into view during playback.                                                                                                           |
| `wordLevelEditing`      | bool             | `false`              | Word-granular editing/muting (Section 8). **Forced on** by the rigid profile (its `wordLevelOnly` policy), regardless of this prop.                                                                   |
| `transcriptDataLive`    | object           | —                    | Interim/streaming STT results (same DPE shape), appended as they arrive.                                                                                                                              |
| `autoSaveContentType`   | string           | `'digitalpaperedit'` | Output format for the save/auto-save callbacks (Section 7).                                                                                                                                           |
| `handleSaveEditor`      | func             | —                    | Called when the user clicks **Save**.                                                                                                                                                                 |
| `handleAutoSaveChanges` | func             | —                    | Called on every change.                                                                                                                                                                               |
| `onShowRawSource`       | func             | —                    | **Word-level mode only.** When set, a **"Raw…"** button appears in a word's inline editor; clicking it calls `onShowRawSource({ key, start })` so your app can open the raw JSON source at that word. |
| `handleAnalyticsEvents` | func             | —                    | Analytics hook `(eventName, data)`. Accepted but not in `propTypes`.                                                                                                                                  |
| `optionalBtns`          | jsx              | —                    | Extra buttons/React nodes rendered in the side panel. Accepted but not in `propTypes`.                                                                                                                |
| `children`              | node             | —                    | Extra UI rendered below the media controls. Accepted but not in `propTypes`.                                                                                                                          |

> **React-19 defaults note.** React 19 ignores `Component.defaultProps` on function components, so
> the component merges a `DEFAULT_PROPS` object into incoming props instead (`{ ...DEFAULT_PROPS,
...props }`). The default **values** above are unchanged; this is purely how they're applied.

---

## 7. Callbacks & save formats

```jsx
<SlateTranscriptEditor
  transcriptData={dpeJson}
  mediaUrl={mediaUrl}
  autoSaveContentType="digitalpaperedit"
  handleAutoSaveChanges={(content) => {
    /* fires on every edit — persist/draft it */
  }}
  handleSaveEditor={(content) => {
    /* fires on Save click — POST to backend */
  }}
  handleAnalyticsEvents={(eventName, data) => {
    /* e.g. ste_handle_save, ste_handle_export … */
  }}
/>
```

- **`handleAutoSaveChanges`** fires on every keystroke/edit. On long files (> ~45 min) this is
  laggy — debounce or prefer explicit save.
- **`handleSaveEditor`** fires on the Save button (only when `isEditable`).
- **`autoSaveContentType`** controls what the two callbacks receive:
  - `'digitalpaperedit'` (default) — DPE JSON, with timecode re-alignment run on export.
  - `'slate'` — the raw Slate value, no alignment.
- The in-UI **Export** menu offers: plain text, Word (`.docx`), `srt`, `vtt` (+ speaker /
  paragraph variants), `itt`, `ttml`, `premiereTTML`, `csv`, plus JSON (Slate / DPE) variants. A
  profile may add its own exporter (the rigid tier adds **"rev.ai (faithful)"**, Section 9).
- **`handleAnalyticsEvents`** receives event names such as `ste_handle_save`,
  `ste_handle_export`, `ste_handle_timed_text_click`, `ste_set_speaker_name`,
  `ste_handle_replace_text`, `ste_handle_split_paragraph` (and others like
  `ste_handle_set_playback_rate`, `ste_handle_seek_back`, `ste_handle_fast_forward`).

---

## 8. Word-level editing & muting

Enable it:

```jsx
<SlateTranscriptEditor transcriptData={dpeJson} mediaUrl={mediaUrl} wordLevelEditing isEditable />
```

Implemented in `src/components/WordLevelEditor/index.js`. Each word is individually
interactive (the in-UI hint reads _"Click: seek · Double-click: edit · Alt/Opt-click: play/pause ·
Ctrl/Cmd-click: mute"_):

| Gesture                       | Action                                                            |
| ----------------------------- | ----------------------------------------------------------------- |
| **Single-click** a word       | Seek media to that word's start (does **not** change play state). |
| **Double-click** a word       | Inline-edit just that word (Enter/blur commits, Esc cancels).     |
| **Alt / Option-click** a word | Seek to the word and **toggle play/pause**.                       |
| **Ctrl / Cmd-click** a word   | Toggle `muted` on that word.                                      |
| **Click** a timecode          | Seek to the paragraph start and play.                             |

While inline-editing a word, the editor shows small tool buttons next to the input: **Mute /
Unmute** (`.stw-mute-btn`) and — when you pass `onShowRawSource` — a **"Raw…"** button
(`.stw-raw-btn`) that calls `onShowRawSource({ key, start })`.

**Muting:** muted words render struck-through (`.stw-muted`), are **stripped** from
human-facing exports (text, Word, captions), and are **preserved** in JSON exports for faithful
round-trips. Word count per paragraph never changes during edits/mutes, so timing anchors and
custom word props survive the round-trip.

---

## 9. Transcript profiles & tiers (classic vs rigid rev.ai)

A **profile** decides how an imported transcript is converted to Slate, which edits are allowed,
how it exports, and how undo/versioning works. The editor stays format-agnostic and routes
import / edit-gate / export / versioning through the resolved profile. Source:
`src/transcript-model/profile.js`, `classic-profile.js`, `rigid-profile.js`.

Choose a tier with the `profile` prop:

```jsx
<SlateTranscriptEditor profile="rigid" transcriptData={revAiJson} mediaUrl={mediaUrl} />
```

| Profile                                               | When to use                                                                                                          | Edit policy                                                                                                                                                                      | Export / undo                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **classic** (default; omit `profile`, or `'classic'`) | Free-text copyediting of DPE transcripts — the editor's original behavior.                                           | All edits allowed (free text + structural).                                                                                                                                      | Built-in export menu + Slate's own undo.                                                                                                          |
| **rigid** (`'rigid'`)                                 | rev.ai transcripts you must round-trip **byte-faithfully** (preserve punctuation, timings, speaker IDs, confidence). | Words may only be **muted or rewritten** — never added, deleted, or reordered. Structural edits (paragraph split/merge, free text) are blocked. Word-level editing is forced on. | Adds a **"rev.ai (faithful)"** exporter that reconstructs the original rev.ai schema; owns its own overlay-snapshot **undo / redo / revert-all**. |

**The component does not auto-detect the tier** — it resolves whatever you pass via
`resolveProfile(props.profile)`, defaulting to classic. To auto-pick based on the data, detect
it yourself and pass the instance:

```jsx
import { detectProfile } from 'slate-transcript-editor';
const profile = detectProfile(parsedTranscript); // rigid if it looks like rev.ai, else classic
<SlateTranscriptEditor profile={profile} transcriptData={parsedTranscript} mediaUrl={mediaUrl} />;
```

### Registering your own tier

A profile is registered as a **descriptor** `{ id, detect(parsed)->bool, create()->Profile }`
(a fresh instance is created per editor mount, because tiers like rigid hold mutable versioning
state in a closure). The `Profile` instance contract is:

```
{
  id: string,
  import(parsed) -> { value, model },            // value = Slate value; model = tier's internal model (or null)
  editPolicy: { allowsStructuralEdits, allowsFreeText, wordLevelOnly },
  exporters: [{ id, label, ext, run(slateValue) }] | null,   // null = use the editor's default export menu
  versioning: { snapshot, undo, redo, revertAll, canUndo, canRedo, currentOverlay } | null,
  reproject: () -> value | null,                 // re-derive the Slate value (e.g. after undo/redo)
}
```

```js
import { registerProfile } from 'slate-transcript-editor';

registerProfile({
  id: 'my-tier',
  detect: (parsed) => Boolean(parsed?.myMarker),
  create: () => ({
    id: 'my-tier',
    import: (p) => ({ value: convertDpeToSlate(p), model: null }),
    editPolicy: { allowsStructuralEdits: true, allowsFreeText: true, wordLevelOnly: false },
    exporters: null,
    versioning: null,
    reproject: null,
  }),
});
```

`createClassicProfile()` / `createRigidProfile()` return ready instances if you prefer to pass
one directly. The lower-level rev.ai helpers (`isRevTranscript`, `revToModel`, `projectRev`,
`revModelToDpe`) live in `src/transcript-model/` and power the rigid profile, but are **internal**
— they are not re-exported from the package entry. Consume rev.ai support via `profile="rigid"`.

---

## 10. Input data format (DPE JSON)

The classic profile (and `convertDpeToSlate`) expects **Digital Paper Edit** JSON:

```jsonc
{
  "words": [
    { "start": 13.02, "end": 13.17, "text": "There", "id": 0 }, // start/end in seconds (float); text required; id optional
    { "start": 13.17, "end": 13.38, "text": "is", "id": 1 },
  ],
  "paragraphs": [
    { "start": 13.02, "end": 24.2, "speaker": "Speaker 1", "id": 0 }, // start/end seconds; speaker string; id optional
  ],
}
```

- **Word:** numeric `start` / `end` (seconds) and string `text` are required. Extra fields
  (e.g. `confidence`, `muted`) are carried through round-trips.
- **Paragraph:** numeric `start` / `end` and string `speaker` are required.

Real sample to copy: **`src/sample-data/KateDarling-dpe.json`**.

**Feeding a real STT service:** convert its output to this shape first. Existing adapters:
`assemblyai-to-dpe`, `gcp-to-dpe`, `aws-to-dpe`, `speechmatics-to-dpe`, `ibmwatson-to-dpe`
(see the main README). For **rev.ai**, you don't need to flatten to DPE yourself — pass the
parsed rev.ai JSON with `profile="rigid"` and the rigid tier handles the faithful overlay model
(`src/transcript-model/rev-overlay.js`, `rev-to-slate.js`).

---

## 11. Programmatic utilities (no rendering required)

These are pure functions — usable server-side or in a build step without mounting the
component:

```js
import { convertDpeToSlate, converSlateToDpe, slateToText, secondsToTimecode, shortTimecode, timecodeToSeconds } from 'slate-transcript-editor';

// DPE -> Slate -> (edit) -> DPE round-trip
const slateValue = convertDpeToSlate(dpeJson); // dpeJson = { words, paragraphs }
const dpeAgain = converSlateToDpe(slateValue); // -> { words, paragraphs }

// Slate -> plain text (all flags optional)
const txt = slateToText({ value: slateValue, speakers: true, timecodes: true, atlasFormat: false });

// Timecodes
secondsToTimecode(123.45); // "00:02:03:11"
shortTimecode(123.45); // "00:02:03"
timecodeToSeconds('00:02:03'); // 123
```

Notes:

- `converSlateToDpe` is a **format converter only** — it reads each paragraph's
  `children[0].words` and does **not** re-run timecode alignment (the alignment path is left to
  the editor/your own pipeline).
- `convertDpeToSlate` returns an array of `timedText` paragraph nodes, each carrying its words
  on `children[0].words`. Keep that shape if you build Slate values by hand.

---

## 12. Styling & combining with your own CSS

The editor's look is **self-contained**. It is built on **MUI v9 (Emotion-based)** plus a small
block of plain CSS injected via a `<style>` tag inside `src/components/index.js`. **There is no
stylesheet to import** (no `slate-transcript-editor/dist/index.css`).

Three levers to blend it with your app:

**a) Theme it with MUI.** Wrap it in a `ThemeProvider` to control accent/button colors:

```jsx
import { createTheme, ThemeProvider } from '@mui/material/styles';
import '@fontsource/roboto'; // the editor uses Roboto; install @fontsource/roboto and import it, or it falls back to sans-serif

const theme = createTheme({ palette: { primary: { main: '#6200ee' }, secondary: { main: '#03dac6' } } });

<ThemeProvider theme={theme}>
  <SlateTranscriptEditor transcriptData={dpeJson} mediaUrl={mediaUrl} />
</ThemeProvider>;
```

(`createTheme` is MUI v5+'s name — the old MUI v4 `createMuiTheme` no longer exists.)

**b) Override the editor's CSS classes.** Load your stylesheet after the component; the injected
`<style>` has low specificity, so your rules win. The classes worth knowing:

| Class                                | What it styles                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.editor-wrapper-container`          | The scrolling editor pane. ⚠️ Has hardcoded `height: 85vh; overflow: auto;` (+ `padding: 8px 16px`) — usually the first thing you'll override. Also sets `font-family: Roboto`. |
| `.current-word`                      | The word being spoken (karaoke highlight).                                                                                                                                      |
| `.timecode`                          | Clickable paragraph timecodes.                                                                                                                                                  |
| `.unselectable`                      | Non-selectable chrome (timecode / speaker columns).                                                                                                                             |
| `.stw-paragraph`                     | A word-level-editing paragraph.                                                                                                                                                 |
| `.stw-word`                          | An individual word (word-level mode).                                                                                                                                           |
| `.stw-punct`                         | Punctuation between words (non-interactive).                                                                                                                                    |
| `.stw-muted`                         | A muted word (struck-through).                                                                                                                                                  |
| `.stw-word-input`                    | The inline text input shown while editing a word.                                                                                                                               |
| `.stw-edit-wrap` / `.stw-edit-tools` | The inline word-edit wrapper and its tool row.                                                                                                                                  |
| `.stw-mute-btn` / `.stw-raw-btn`     | The Mute/Unmute and "Raw…" buttons in the inline word editor.                                                                                                                   |

```css
/* your app's stylesheet */
.editor-wrapper-container {
  height: 100%;
  padding: 16px 24px;
}
.current-word {
  background: #ffeb3b;
}
.stw-muted {
  color: #c00;
  text-decoration: line-through;
}
```

**c) Use `optionalBtns` / `children`** to inject your own React UI into the side panel and the
area below the media controls.

**⚠️ Duplicate MUI / Emotion:** the editor bundles **MUI v9 + Emotion 11**. If your host app uses
a **different MUI major** (v5/v6/v7) or pulls in a **second Emotion instance**, you'll have two
copies side by side — which can cause class-name collisions, duplicated theming, and style-order
flakiness. Either keep your app on **MUI v9 + Emotion 11** for shared theming (and dedupe
`@mui/material` / `@emotion/react` in your bundler — Section 3), or treat the editor as a
self-contained island and theme it separately.

---

## 13. Worked example

```jsx
import React, { useState } from 'react';
import SlateTranscriptEditor from 'slate-transcript-editor';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import '@fontsource/roboto';
import './transcript.css'; // your overrides for .editor-wrapper-container, .stw-* etc.

const theme = createTheme({ palette: { primary: { main: '#6200ee' } } });

export default function TranscriptPage({ transcript, mediaUrl, isRevAi }) {
  const [draft, setDraft] = useState(null);

  const onSave = async (content) => {
    await fetch('/api/transcripts', { method: 'POST', body: JSON.stringify(content) });
  };

  return (
    <ThemeProvider theme={theme}>
      <div className="my-editor-shell">
        <SlateTranscriptEditor
          transcriptData={transcript}
          mediaUrl={mediaUrl}
          title="Interview — take 2"
          showTitle
          isEditable
          // 'rigid' for faithful rev.ai round-trip (forces word-level mode);
          // omit (or 'classic') for free-text editing.
          profile={isRevAi ? 'rigid' : 'classic'}
          followPlayback
          autoSaveContentType="digitalpaperedit"
          handleAutoSaveChanges={(content) => setDraft(content)}
          handleSaveEditor={onSave}
          handleAnalyticsEvents={(name, data) => console.debug('[ste]', name, data)}
        >
          <small>Edits autosaved locally: {draft ? 'yes' : 'no'}</small>
        </SlateTranscriptEditor>
      </div>
    </ThemeProvider>
  );
}
```

---

## 14. Upgrading from the pre-modernization fork

If your app already embeds an older build of this fork (React 16/17 · Material-UI v4 · Slate
0.59), here's what changes when you move to the modernized build. **The data model and component
API are unchanged** — DPE format, props, the export menu, and all callbacks behave the same.
Only the host-side stack and your theme wrapper need adjusting:

- **Provide React 18.2+ / 19** (was 16/17). React/react-dom are now declared `peerDependencies`,
  so npm will warn if your version is out of range.
- **Stop hand-installing MUI/Emotion/Slate/docx** — they're bundled `dependencies` now. Your old
  `npm install @material-ui/core @material-ui/icons` step goes away.
- **In your MUI theme wrapper:** `createMuiTheme` → **`createTheme`**, imported from
  `@mui/material/styles` (was `@material-ui/core/styles`). If you referenced MUI components
  directly anywhere around the editor, migrate `@material-ui/core` → `@mui/material` and
  `@material-ui/icons` → `@mui/icons-material`.
- **Font import:** `import 'fontsource-roboto'` → **`import '@fontsource/roboto'`** (install
  `@fontsource/roboto`), or rely on the system sans-serif fallback.
- **CSS overrides** keep working — the injected `<style>` class names are unchanged (a few new
  ones were added; see Section 12).

For the complete migration story (phase-by-phase, gotchas, merge runbook), see
[`modernization.md`](./modernization.md).

---

## 15. Known limitations

- **Alpha** (`0.1.6-alpha.19`); API may change. The profile/tier exports are recent additions.
- **Not on npm as this fork** — must be built/packed locally (Section 3). `npm run publish:public`
  exists if you want to publish your own build.
- **React 18.2+/19 · MUI v9 + Emotion 11 · Slate 0.124** expected (Section 2). Older React/MUI/Slate
  are not supported by this build.
- **No TypeScript types** shipped (plain JS).
- **No ref / imperative API** — props and callbacks only.
- **No importable CSS file** — styling is self-contained (Section 12).
- `handleAnalyticsEvents`, `optionalBtns`, and `children` are functional but not declared in
  `propTypes`.
- Tier auto-detection is **not** automatic in the component — call `detectProfile(parsed)`
  yourself and pass the result to `profile` if you want it.
