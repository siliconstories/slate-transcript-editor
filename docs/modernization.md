---
title: slate-transcript-editor toolchain modernization
status: complete
date: 2026-05-31
repo: slate-transcript-editor
base_branch: master # baseline 00fe656 — UNTOUCHED
head_branch: modernize/phase-8-jest # e546b80
commit_range: master..modernize/phase-8-jest # 17 commits (6 pre-existing + 11 this cycle)
audience: [developers, agentic-harnesses]
final_stack:
  react: 19.2.6
  react-dom: 19.2.6
  slate: 0.124.1
  slate-react: 0.124.2
  slate-dom: 0.124.1
  slate-history: 0.113.1
  '@mui/material': 9.0.1
  '@mui/icons-material': 9.0.1
  '@emotion/react': 11.14.0
  '@emotion/styled': 11.14.1
  storybook: 10.4.1
  '@storybook/react-vite': 10.4.1
  jest: 30.4.2
  jest-environment-jsdom: 30.4.1
  '@testing-library/react': 16.3.2
  '@testing-library/dom': 10.4.1
  docx: 9.7.1
  vite: 7.3.3
  '@vitejs/plugin-react': 4.7.0
  '@babel/preset-env': 7.29.7
  gh-pages: 6.3.0
  pinned_intentionally:
    stt-align-node: 2.0.1 # round-trip-critical; never `npm audit fix --force`
gate_state:
  tests: '131 passed / 6 skipped / 12 snapshots'
  build_component: 'exit 0 — 76 dist js files, 0 test/stories leaked'
  demo_build: 'exit 0'
  storybook_build: 'exit 0 — 6 story files + autodocs'
  npm_audit: '27 vulns (5 moderate, 17 high, 5 critical) — recorded, NOT force-fixed'
merged_to_master: false # intentionally left on branch for review
---

# slate-transcript-editor — toolchain modernization

> **What this is.** A complete record of modernizing `slate-transcript-editor`
> (a published React component library for correcting word-timed transcripts on
> the Slate editor) from a toolchain frozen circa 2020 to the latest stack, while
> **preserving behavior**. It reconciles the **designed plan** with the **actual
> execution** (every deviation is called out), captures the **reusable gotchas**,
> gives **copy-paste verification**, and ends with a **git merge-to-master runbook**.
>
> **For agentic harnesses:** the frontmatter is machine-parseable; §3 (commit map),
> §6 (gotchas), §7 (verification), and §9 (operate-this-repo) are the load-bearing
> sections. The full original design lives in the resumable plan at
> `~/.claude/plans/i-want-to-modernize-delightful-wilkes.md`; the session runbook at
> `~/.claude/plans/resume-claude-plans-i-want-to-modernize-giggly-sphinx.md`.

---

## 1. Executive summary

The library's toolchain was frozen ~2020: React 16.14 (not even a declared dep),
Slate 0.59, Material-UI v4, Storybook 5.3 on webpack 4, Jest 27, a Babel build, and
docx 4.7.1. The dominant risk was a **1218-line, originally-untested editor**
(`src/components/index.js`) plus untested `WordLevelEditor`, `SideBtns`,
`dpe-to-slate`, and `slate-to-dpe`.

The modernization ran in **9 gated phases (0–8)**, each its own branch + atomic,
revertible commit, each advancing only after a **CLI + headless-browser gate**
passed. Phases 0–4 were completed in a prior session; **phases 5–8 were executed
autonomously in this cycle** (11 new commits).

**Outcome:** React 19.2.6 · Slate 0.124 (+ `slate-dom`) · MUI v9 + Emotion 11 ·
Storybook 10 on Vite · Jest 30. 131 tests + 12 snapshots green; component build,
demo build, and Storybook build all exit 0; the demo renders **pixel-equivalent to
the pre-migration baseline**. `master` is untouched.

---

## 2. Methodology — how the work was structured

### 2.1 Sequencing rationale (lowest-risk-first; verified by an adversarial pass)

The naïve "upgrade the core libraries first" order was **rejected**. Three findings
drove the actual order:

1. **Builder before libraries.** webpack 4's acorn 6 can't parse `??`/`?.` emitted by
   modern MUI → the demo moved to **Vite before** any upgrade (Phase 3), so the
   browser gate survives the whole sequence.
2. **MUI is the React-18 blocker, not Slate.** `@material-ui/core@4` peers
   `react ^16.8 || ^17`; `npm i react@18` ERESOLVEs. slate-react 0.59 itself survives
   React 18. → migrate **MUI to v9 on a React-17 bridge first** (Phases 4→5), then
   bump React + Slate together (Phase 6). No broken MUI↔React peer window.
3. **Slate is a real code migration, not a version bump.** The data model is safe
   (dpe↔slate round-trips unchanged), but `value→initialValue`, programmatic
   reprojection, and the 0.116 decoration change are mandatory runtime migrations
   (Phase 6).

Final order: **0** safety net → **1** leaf cleanup → **2** docx → **3** tooling +
demo→Vite → **4** React 16→17 → **5** MUI v4→v9 (on React 17) → **6** React 17→19 +
Slate 0.59→0.124 → **7** Storybook 5→10 (Vite) → **8** Jest 30.

> **Storybook downtime window (intentional):** SB5/webpack4 stops building once MUI
> is modern (Phase 5). Storybook was **deliberately left broken from Phase 5 until
> Phase 7**; the **Vite demo (`:9009`) was the sole browser gate** during that window.

### 2.2 The per-phase gate (the definition of "done" for each phase)

Every phase had to pass, in order, before the next began:

- `npm test` green (count grows over phases as suites are added).
- `npm ls <deps>` → no UNMET **required** peer (optional peers like
  `@mui/material-pigment-css` ignored).
- `npm run build:component` exit 0; `dist/` has **no** `*.test.js`/`*.stories.js`
  (76 js files, 0 leaked).
- `npm run demo:build` exit 0 (no legacy node flags).
- **Headless browser gate** via `agent-browser` against the demo on `:9009`:
  navigate → click a sample → assert render → read console (errors) → drive
  click-word-seek / type-an-edit / exports → **visual-diff vs `baseline/`**.
- On failure: diagnose, fix **minimally** (no refactor-while-fixing), re-run the
  **whole** gate. After 3 failing cycles → STOP and surface diagnostics.

### 2.3 Cross-phase invariants (measured at every gate)

- **Phase-0 golden suites** — docx XML structural diff + txt/dpe↔slate goldens.
- **`baseline/01-playground-landing.png`, `baseline/02-editor-kate.png`** — visual diff target.
- **Phase-6 integration test** — added once, must stay green through 7 & 8.
- **Never** `npm audit fix --force`; `stt-align-node` stays pinned `2.0.1`.

---

## 3. Commit map

Branch chain (each phase branched off the previous; labels point at each phase's
final commit). `git log --oneline master..modernize/phase-8-jest`:

| Phase | Commit    | Summary                                                      |
| ----- | --------- | ------------------------------------------------------------ |
| 8     | `e546b80` | Jest 27 → 30, finalize test runner                           |
| 7     | `4772d17` | Storybook 5.3 → 10 on `@storybook/react-vite`                |
| 6c    | `3a0e4b1` | React 18.3 → 19.2.6 + `createRoot`, complete core            |
| 6b    | `5230a64` | Slate 0.59 → 0.124 (+ `slate-dom`) + runtime rework          |
| 6a    | `f924719` | React 17 → 18.3 + RTL 16                                     |
| 6-pre | `a7093e7` | fix: MUI v9 Grid — `direction="column"` → `sx` flexDirection |
| 5d    | `50ef303` | MUI v7 → v9 (final MUI target)                               |
| 5c    | `f374955` | MUI v6 → v7                                                  |
| 5b    | `00d701b` | MUI v5 → v6 + migrate Grid → Grid2 API                       |
| 5a    | `2c84d57` | Material-UI v4 → MUI v5 + Emotion 11                         |
| 5-pre | `a5db510` | fix: correct invalid MUI props + drop dead imports (on v4)   |
| 4     | `6870c2f` | React 16.14 → 17.0.2 bridge                                  |
| 3     | `19aef77` | prettier 3 full-codebase reformat                            |
| 3     | `fb2f20c` | tooling hygiene + demo on Vite                               |
| 2     | `ab9b9bd` | docx 4.7.1 → 9 exporter rewrite                              |
| 1     | `af8e15e` | drop dead leaf deps (p-debounce, node-fetch)                 |
| 0     | `5d31b3e` | regression safety net (no upgrades)                          |

Branch labels: `modernize/phase-0-safety-net` … `modernize/phase-8-jest`
(phases 6/7/8 were committed on `phase-6-core`; `phase-7-storybook` and
`phase-8-jest` labels were created retroactively at `4772d17` and `e546b80`).

---

## 4. Phases 0–4 (prior session) — recap

These predate this cycle; verified green at resume.

- **Phase 0 — Regression safety net (`5d31b3e`).** Declared react/react-dom
  explicitly; added RTL 12 + jest-environment-jsdom 27; `.nvmrc` → 22,
  `engines.node` ≥ 20. `.babelrc` test env `@babel/preset-env { targets: node:current }`
  (fixes "regeneratorRuntime is not defined"). Split docx into pure
  `buildDocxDocument()` + `downloadDocx()`. Authored the **golden suites** (docx XML
  structural diff, txt/dpe↔slate snapshots) and the **first-ever editor test**
  (`index.smoke.test.js`, RTL+jsdom). Captured `baseline/*.png`.
- **Phase 1 — Leaf cleanup (`af8e15e`).** Removed `p-debounce` + `node-fetch` (zero imports).
- **Phase 2 — docx 4.7.1 → 9 (`ab9b9bd`).** Rewrote to the declarative docx 9 API; v9
  XML proven element-for-element equivalent to v4 via the golden + 6 structural assertions.
- **Phase 3 — Tooling + demo → Vite (`fb2f20c`, `19aef77`).** Babel automatic JSX
  runtime; **demo moved off webpack 4 to Vite 7**; husky 4→9; prettier 2→3;
  `@fontsource/roboto` 5. The dist test/stories exclusion moved to the
  `babel … --ignore` CLI flag (the `.babelrc ignore` broke babel-jest).
- **Phase 4 — React 16 → 17 (`6870c2f`).** Bridge bump; no source changes.

---

## 5. Phases 5–8 (this cycle) — plan vs actual

Each phase below: **Plan** (what was designed) → **Actual** (what happened) →
**Decisions/deltas** → **Verification**.

### Phase 5 — Material-UI v4 → MUI v9 + Emotion 11 (on React 17)

**Plan.** Migrate to `@mui/material` v9 + Emotion 11 _while on React 17_ (no broken
peer window). Stepped v4→v5→v6→v7→v9 (no v8 ever shipped). No JSS rewrite (RA2: zero
`makeStyles`/`withStyles`/`styled`/`sx`). The Vite demo is the visual gate. First, a
separate reviewable commit on v4 to fix invalid props.

**Actual.**

- **`a5db510` (pre, on MUI v4):** fixed lowercase `justifycontent` → `justifyContent`,
  dropped invalid `block="true"` Button props, removed confirmed-dead imports.
- **`2c84d57` (5a):** installed `@mui/material@5 @mui/icons-material@5 @emotion/react
@emotion/styled`; ran `@mui/codemod v5.0.0/preset-safe ./src ./demo`; uninstalled
  `@material-ui/*`. Added `custom-theme.test.js` to guard the `createTheme(palette)`
  path (Storybook being down P5→P7). Dropped the codemod's `adaptV4Theme` shim
  (removed in v6, unnecessary for this palette).
- **`00d701b` (5b):** v6 + migrated all 30 Grid sites from the legacy API to the
  modern **Grid2** (`@mui/material/Grid2`): drop `item`, fold `xs/sm/md/lg/xl` into
  `size={{…}}`, move `justifyContent`/`alignItems` into `sx`. Manual (not codemod —
  weak on JSX-in-`.js`). `container`/`direction`/`spacing` kept; `className`/
  `contentEditable`/`{...attributes}` verified to forward through Grid2.
- **`f374955` (5c):** v7 — repointed `@mui/material/Grid2` → `@mui/material/Grid`
  (v7 promotes the new API to `Grid` and **removes** the `Grid2` path; legacy →
  `GridLegacy`). Props already in the new format.
- **`50ef303` (5d):** v9 — dependency bump only; `GridLegacy` confirmed removed in v9
  and unused; no v9-removed icon/component exports in use.

**Decisions/deltas.**

- **Load-bearing assumption verified before starting:** `@mui/material@9.0.1` peers
  `react: ^17.0.0 || ^18.0.0 || ^19.0.0` — React 17 is supported through v9, so the
  React-17-bridge strategy holds end to end.
- **`justifycontent` typos were 7, not the plan's "9"** (the plan over-counted; the
  7 enumerated lines were exactly right).
- **Dead-import list in the plan was partly wrong:** in `SideBtns`, `CachedOutlinedIcon`
  and `InfoOutlined` are _used_ — only `HelpOutlineOutlinedIcon` was dead. Removal was
  made **usage-driven**, not list-driven.
- **Grid migration done now (5b), not deferred to v9** — isolates the highest-churn
  change in its own gated commit; v7/v9 Grid steps became trivial.
- `@mui/material-pigment-css` shows as an UNMET _optional_ peer in `npm ls` — expected,
  not a gate failure.

**Verification (each sub-step).** 126 tests; `npm ls` no UNMET required peer; build
76/0; demo:build 0; browser — editor renders, Emotion injects styles, Grid layout
matches baseline, SideBtns export **Menu/Popover** opens with all 25 items, both
render paths (Slate `<Editable>` + `WordLevelEditor`) intact, `contentEditable={false}`
forwards through Grid2 (176 nodes — keeps timecode/speaker columns non-editable).

### Phase 6 — COUPLED CORE: React 17→19 + Slate 0.59→0.124 (the riskiest phase)

**Plan.** slate-react 0.124 hard-requires `react ≥ 18.2` + a new `slate-dom` peer, so
React and Slate finish together. Sub-step ladder: 6a React→18.3 (Slate 0.59, RTL→16,
legacy render); 6b Slate→0.124 (+ slate-dom, slate-history 0.113.1) with mandatory
code migrations; 6c React→19.2.6 + `createRoot`. Add a jsdom `<Slate>/<Editable>`
integration test — "the only thing that catches the RA1 breaks the unit goldens cannot."

**Actual.**

- **`a7093e7` (pre):** MUI v9 Grid `direction="column"` fix (see deltas) — surfaced by
  React-18 dev propType validation.
- **`f924719` (6a):** react/react-dom → 18.3.1; `@testing-library/react` → 16 (+ its
  now-peer `@testing-library/dom@10`). Widened `peerDependencies` to
  `^18.2.0 || ^19.0.0`. Slate stayed 0.59; demo stayed on `ReactDOM.render`.
- **`5230a64` (6b):** slate 0.124.1 + slate-react 0.124.2 + **slate-dom ^0.124** +
  slate-history 0.113.1. Code migrations:
  - `<Slate value=>` → **`initialValue=`** (slate-react 0.95+ reads the document once;
    it is no longer controlled).
  - Added a `slateKey` state + **`replaceSlateValue(newValue)`** helper that bumps the
    key to **remount `<Slate>`** (re-runs `editor.children = initialValue`) for the 4
    programmatic whole-document reprojections: `handleReplaceText`,
    `handleRestoreTimecodes`, and rigid undo/redo (`profile.reproject` ×2).
  - **Karaoke decoration audited vs the 0.116 change:** `decorate` identity changes on
    `activeWordIndex`, so decorations recompute and the active-word highlight still
    tracks playback.
  - Module-scope `React.createRef()` → per-instance `useRef` (latent multi-instance bug).
  - Migrated the `SlateSimpleEditor` story to `initialValue` (Phase-7 readiness).
  - Added `slate-editor.integration.test.js` (5 tests).
- **`3a0e4b1` (6c):** react/react-dom → 19.2.6 (exact match); `demo/standalone.jsx`
  `ReactDOM.render` → `createRoot().render`; React 19 ignores `defaultProps` on
  function components → moved defaults into a **`DEFAULT_PROPS` merge** at the top of
  the component (critical for `isEditable`, read directly in 4 places).

**Decisions/deltas.**

- **`<Slate>` re-initialization mechanism confirmed by reading the slate-react source:**
  `<Slate>` sets `editor.children = initialValue` inside a `useState` lazy initializer
  that runs **once per mount** — so a `key` bump remounts and re-reads `initialValue`.
  This makes the key-remount reproject strategy correct.
- **Slate fires `onChange` on a microtask** (`Promise.resolve().then`), not synchronously
  — the integration test's edit assertion needed `await act(async () => …)` to flush it.
  (A non-obvious trap for any future Slate-on-RTL test.)
- **`defaultProps` is a React-19 landmine:** silently ignored in 19, so any default read
  directly (not behind an inline `typeof … ? … : default`) would change behavior. Only
  `isEditable: true` was at risk → the `DEFAULT_PROPS` merge preserves all of them.
- **Installs from 6a until Phase 7 required `--legacy-peer-deps`** because the
  still-present Storybook 5 chain (`@reach/router`) peers react 15/16.

**Verification.** 131 tests (+5 integration) on React 19 + Slate 0.124, **zero React
warnings**; `slate-dom` satisfies the slate-react peer; build 76/0; demo:build 0.
Browser FULL walkthrough: classic `<Editable>` **type-an-edit persists**; active-word
**highlight tracks playback** (word "ago" at t=15s); rigid tier — a **mute overlay edit
applies and Undo reproject reverts it with all 13 words intact**; **StrictMode** wrap
(rebuilt + tested, then reverted) → one active-word, **no double-listener artifact**;
console clean.

### Phase 7 — Storybook 5.3 → 10 on Vite

**Plan.** Rebuild Storybook last, against final React 19 + MUI v9. Stepped: manual
SB5→6 (no automigrate) → `storybook@8 upgrade` → `@9` → `@10`. Rewrite
`.storybook/main.js` to ESM `@storybook/react-vite` with the Phase-3 Vite gotchas in
`viteFinal`. Convert the 4 knobs files to CSF3 args/argTypes; remove `withInfo`/
`addon-info`/dead addons/`openssl-legacy-provider`; gh-pages 2→6.

**Actual (`4772d17`) — DEVIATED to a clean reinstall.** The SB5 starting point
(webpack 4, `@reach/router` pinned to react 15/16) makes the in-place 5→6→8→9→10 chain
a peer-conflict tar pit; a **clean SB10 install reaches the identical end state
deterministically**. So:

- Removed all SB5 packages; installed `storybook@10.4.1`, `@storybook/react-vite`,
  `@storybook/addon-docs/a11y/links @10`.
- Rewrote `.storybook/main.js` to ESM `@storybook/react-vite`; `viteFinal` reuses the
  three demo Vite gotchas (JSX-in-`.js` esbuild loader, `path`→`path-browserify` alias,
  `stripDifflibNameAssign` plugin). Added `.storybook/preview.js` with global autodocs
  (replaces `addon-info`).
- Converted all 6 story files: knobs → CSF3 args/argTypes (story 1 fully args-driven
  controls), removed `withKnobs`/`withInfo`/`.story` annotations, `action` import
  `@storybook/addon-actions` → `storybook/actions`.
- Scripts `start/build-storybook` → `storybook dev/build` (dropped openssl flag);
  gh-pages 2→6.

**Decisions/deltas.**

- **`@babel/preset-env` made an explicit devDependency.** It was only transitively
  present via the SB5 chain; the `.babelrc` test env requires it. Pruning SB5 broke
  **babel-jest** (all suites failed: "Cannot find module '@babel/preset-env'") until it
  was added explicitly. (A latent fragility the migration surfaced and fixed.)
- The deviation to a clean reinstall is the senior-engineer call for autonomous
  reliability — the plan's stepped path was the _means_, not the goal.

**Verification.** `storybook build` exit 0 (6 story files + autodocs). Browser (static
`.out`): Demo story renders the full editor, Custom-Theme renders
(`createTheme`/`ThemeProvider` + Emotion), the **autodocs page shows the args controls
table**. 131 tests + build 76/0 + demo:build + `:9009` demo all still green; no openssl
flag, no SB5 packages.

### Phase 8 — Jest 27 → 30 (close out the runner)

**Plan.** Bump jest + babel-jest + jest-environment-jsdom to 30; set
`testEnvironment: 'node'` default + jsdom for RTL/integration; re-evaluate
`NODE_OPTIONS=--experimental-vm-modules` empirically (keep only if required).

**Actual (`e546b80`).**

- jest + babel-jest + jest-environment-jsdom → 30.4.x. **No `--legacy-peer-deps`
  needed** (Phase 7's SB5 removal cleared the react peer conflicts; `npm audit` dropped
  116 → 27 vulns).
- **Dropped `--experimental-vm-modules`** — Jest 30 runs the
  sbd/sanitize-html/docx-9/@fontsource ESM chain green without it (verified by running
  the suite both with and without).
- Made `testEnvironment: 'node'` explicit; RTL/integration/smoke suites opt into jsdom
  via `@jest-environment jsdom` docblocks.
- **Re-baselined 7 golden snapshots** to Jest 30's `pretty-format`: escaped-quote
  removal in the docx XML strings (`\"` → `"`); `Array []`/`Object {}` → `[]`/`{}` for
  the slate snapshots. **Serialization-only** — data byte-identical; the docx structural
  assertions (the durable v4↔v9 contract) still pass.

**Verification (final acceptance).** Full pipeline dry run all exit 0:
`npm test` (131 pass, 12 snapshots) `&& build:component` (76/0) `&& demo:build`
`&& storybook build`. Browser `:9009` demo renders **identically to
`baseline/02-editor-kate.png`**; SB10 stories + autodocs render at `.out`. `npm audit`:
27 vulns recorded, not force-fixed.

---

## 6. Hard-won gotchas (reusable — several will recur for future maintainers/agents)

1. **Vite + JSX-in-`.js`.** This repo writes JSX in `.js`. Both `demo/vite.config.mjs`
   and `.storybook/main.js` need
   `esbuild: { loader: 'jsx', jsx: 'automatic', include: /\.jsx?$/, exclude: /node_modules/ }`
   plus `optimizeDeps.esbuildOptions.loader['.js'] = 'jsx'`. The demo HTML entry must be
   `standalone.jsx` (Vite's build-html scanner parses the entry before transform).
2. **Node `path` in browser code.** `get-media-type` and `index.js` use `path.extname`/
   `path.basename`. Vite doesn't auto-polyfill → alias `path` → `path-browserify` in
   both Vite configs. (`index.js`'s Slate-`path` local is a different thing — leave it.)
3. **difflib read-only `.name` assignment.** `difflib` (via `stt-align-node`) does
   `SequenceMatcher.name = …` — a no-op under webpack CJS but **throws under Vite strict
   ESM**. The `stripDifflibNameAssign` `enforce:'pre'` plugin (in both Vite configs)
   strips it.
4. **`.babelrc` `ignore` breaks babel-jest** — keep the dist test/stories exclusion on
   the `babel … --ignore` CLI flag.
5. **`@babel/preset-env` must be an explicit devDep** — it was only transitively present;
   removing SB5 pruned it and broke all jest suites.
6. **MUI v9 Grid dropped `direction="column"`** — `@mui/material/Grid` validates
   `direction` as `oneOf(['row','row-reverse'])`. Use `sx={{ flexDirection: 'column' }}`
   for column layouts. (Production builds hide the propType warning; jest dev mode shows it.)
7. **Grid2 path moves across MUI majors:** v5 `Unstable_Grid2` → v6 `@mui/material/Grid2`
   → v7+ `@mui/material/Grid` (Grid2 path removed, legacy → `GridLegacy`, removed in v9).
8. **slate-react `<Slate>` reads `initialValue` once per mount** (lazy `useState`) — bump
   a `key` to remount and re-read it for programmatic full-document replacement.
9. **Slate flushes `onChange` on a microtask** — tests must `await act(async () => …)`.
10. **React 19 ignores `defaultProps` on function components** — merge defaults manually
    for any prop read without an inline fallback.
11. **Jest 30 `pretty-format` changed** — re-baseline snapshots (`jest -u`); the diffs are
    quote-escaping + `Array`/`Object` prefix removal, not behavioral.
12. **Browser gate is headless `agent-browser`** against `:9009`. The video element won't
    load media in headless mode (readyState 0); to test the karaoke decoration, override
    the `currentTime` getter and dispatch a `timeupdate` event.

---

## 7. Verification — reproduce the green state

```bash
cd <repo>           # branch: modernize/phase-8-jest
npm ci              # or `npm install --legacy-peer-deps` if resolving from an older lock

# CLI gate
npm test            # 131 passed / 6 skipped, 12 snapshots
npm run build:component   # exit 0 — then: find dist -name '*.js' | wc -l  → 76
                          #          find dist -name '*.test.js' -o -name '*.stories.js' | wc -l → 0
npm run demo:build        # exit 0
npm run build-storybook   # exit 0 → output in .out/

# Browser gate (headless)
node demo/serve.js &                       # serves demo-dist on :9009 (EADDRINUSE = reuse)
agent-browser open http://localhost:9009   # click "Kate Darling" → editor renders; console clean
# Storybook static check:
( cd .out && python3 -m http.server 6008 & )
agent-browser open "http://localhost:6008/iframe.html?id=slatetranscripteditor--demo&viewMode=story"

npm audit          # 27 vulns — RECORD only. NEVER `npm audit fix --force` (breaks stt-align-node).
```

**Live dev servers:** `npm run storybook` (:6006, hot reload) · `npm run demo:start`
(:9009).

---

## 8. Compatibility matrix (final)

| Package                          | From                | To                                     |
| -------------------------------- | ------------------- | -------------------------------------- |
| react / react-dom                | 16.14               | **19.2.6**                             |
| slate                            | 0.59                | **0.124.1**                            |
| slate-react                      | 0.59                | **0.124.2**                            |
| slate-dom (new)                  | —                   | **0.124.1**                            |
| slate-history                    | 0.59                | **0.113.1**                            |
| @mui/material + icons            | @material-ui v4     | **9.0.1**                              |
| @emotion/react + styled (new)    | —                   | **11.14.x**                            |
| storybook + framework            | 5.3 (webpack)       | **10.4.1** + `@storybook/react-vite`   |
| jest + jest-environment-jsdom    | 27                  | **30.4.x**                             |
| @testing-library/react           | —                   | **16.3.2** (+ @testing-library/dom 10) |
| docx                             | 4.7.1               | **9.7.1**                              |
| vite (demo + storybook)          | — (was webpack 4)   | **7.3.3**                              |
| @babel/preset-env (now explicit) | transitive          | **7.29.7**                             |
| gh-pages                         | 2                   | **6.3.0**                              |
| husky / prettier                 | 4 / 2               | **9 / 3**                              |
| @fontsource/roboto               | fontsource-roboto 4 | **5**                                  |
| **stt-align-node (pinned)**      | 2.0.1               | **2.0.1** (intentional)                |

Peer health: **no UNMET/invalid required peers**.

---

## 9. For agentic harnesses — how to operate this repo now

- **HEAD:** `modernize/phase-8-jest` (`e546b80`); `master` (`00fe656`) is untouched and
  not yet merged.
- **Tests:** `npm test` (plain `jest`, node env default; jsdom via docblock). Adding an
  editor/RTL test → start the file with `/** @jest-environment jsdom */` and reuse the
  Selection/Range/HTMLMediaElement polyfills + `await act(async …)` pattern from
  `src/components/slate-editor.integration.test.js`.
- **The editor is no longer controlled by `value`.** To replace the whole document
  programmatically, call the existing `replaceSlateValue(newValue)` (state + `slateKey`
  remount), never `setValue` alone.
- **Grid:** modern API only (`size={{…}}`, no `item`); flex direction via `sx`, not the
  `direction` prop for columns.
- **Storybook:** stories are CSF3 (`export const X = { args | render }`); `action` from
  `storybook/actions`; autodocs is global in `.storybook/preview.js`.
- **Do NOT** run `npm audit fix --force` or upgrade `stt-align-node` off `2.0.1` (breaks
  the dpe↔slate round-trip).
- **Vite configs** (`demo/vite.config.mjs`, `.storybook/main.js`) carry three required
  shims — see §6 (1)–(3); copy them into any new Vite entry point.
- Source-of-truth design docs: the resumable plan
  `~/.claude/plans/i-want-to-modernize-delightful-wilkes.md` and the per-commit messages.

---

## 10. Known issues & suggested follow-ups (out of migration scope)

- **`npm audit`: 27 vulns** (5 moderate, 17 high, 5 critical) — down from 116. Mostly in
  **dead webpack-era dev tooling** (e.g. `babel-loader@8`, no longer used now that both
  demo and Storybook are on Vite) and `stt-align-node`'s accepted transitive set. A safe
  cleanup PR could remove `babel-loader` and other webpack-only devDeps and re-audit.
- **`prop-types` retained** — React 19 silently ignores `.propTypes` (harmless). Could be
  removed in a later pass if desired.
- **Pigment-CSS** is an unmet _optional_ MUI peer — intentionally not installed.

---

## 11. Merge-to-master runbook

> `master` is currently **untouched** and the branch chain is intentionally left
> unmerged for review. Pick ONE of the strategies below.

**Pre-merge checklist (run on `modernize/phase-8-jest`):**

```bash
git status                      # clean tree (only known untracked: baseline/phase*.png, INTEGRATION.md, REV-AI-JSON-FORMAT.md, docs-adds/)
npm ci && npm test              # 131 pass
npm run build:component && npm run demo:build && npm run build-storybook   # all exit 0
git fetch origin && git log --oneline origin/master..master   # confirm master hasn't diverged
```

### Option A — Pull request (recommended for a published library)

```bash
git push -u origin modernize/phase-8-jest
gh pr create --base master --head modernize/phase-8-jest \
  --title "Modernize toolchain: React 19 · Slate 0.124 · MUI v9 · Storybook 10 · Jest 30" \
  --body-file docs/modernization.md
# optional: /code-review ultra on the branch before merging
gh pr merge --merge        # preserves the 11-commit phase history (each phase revertible)
```

### Option B — Local merge commit (preserve phase history)

```bash
git checkout master
git merge --no-ff modernize/phase-8-jest -m "Modernize toolchain (phases 0–8): React 19 · Slate 0.124 · MUI v9 · Storybook 10 · Jest 30"
```

### Option C — Squash (single commit on master)

```bash
git checkout master
git merge --squash modernize/phase-8-jest
git commit   # author a combined message; summarize from §3 + §5
```

**Recommendation:** **Option A or B.** The 11 commits are atomic and individually
revertible (e.g. `git revert 5230a64` backs out only the Slate 0.124 runtime rework);
squashing forfeits that bisect/revert granularity for a high-risk migration.

**Post-merge:**

```bash
npm test && npm run build:component   # re-confirm on master
# branch cleanup (optional): delete the phase branches once satisfied
for b in 0-safety-net 1-leaf-deps 2-docx9 3-tooling-vite 4-react17 5-mui 6-core 7-storybook 8-jest; do
  git branch -d "modernize/phase-$b"
done
# publish (when ready): npm run publish:public   # builds dist/ and npm publish --access public
```

**Rollback:** every phase is an isolated commit; if a regression surfaces post-merge,
`git revert <phase-sha>` (or revert the merge commit) restores the prior phase, which
remains shippable. The Phase-0 goldens + the Phase-6 integration test + `baseline/*.png`
are the invariants any rollback is measured against.
