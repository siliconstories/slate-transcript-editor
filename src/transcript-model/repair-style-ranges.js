/**
 * Anchor repair for the user-styling layer — run repair-then-commit on every
 * snapshot, so a snapshot's `styles` are always consistent with that snapshot's words.
 *
 * Style ranges are anchored to model word keys. When a word is DELETED in Loose mode
 * (a freetext paragraph rebuild drops its key) the anchor must be repaired:
 *   - clamp a dead endpoint to the nearest surviving word in model order,
 *   - drop the range if every word it spanned is gone,
 *   - clamp sub-word offsets against a rewritten (possibly shorter) word.
 * Muting does NOT delete a word (it stays in the value, reversible), so muted words
 * keep their styling. Inserted words (ref == null) have no model key and so are never
 * endpoints — they start unstyled.
 */

/** Keys deleted by a freetext paragraph rebuild (owned by the span but absent from its tokens). */
const deletedKeys = (model, overlay) => {
  const words = (model && model.words) || [];
  const orderIndex = new Map(words.map((w, i) => [w.key, i]));
  const deleted = new Set();
  Object.keys(overlay || {}).forEach((k) => {
    const e = overlay[k];
    if (!e || e.kind !== 'freetext') return;
    const span = e.span || {};
    const a = orderIndex.get(span.firstWordKey);
    const b = orderIndex.get(span.lastWordKey);
    if (a == null || b == null) return;
    const refs = new Set((e.tokens || []).map((t) => t.ref).filter((r) => r != null));
    for (let i = a; i <= b; i += 1) {
      if (!refs.has(words[i].key)) deleted.add(words[i].key);
    }
  });
  return deleted;
};

/** Current displayed length of a word (rewritten value wins over the model base). */
const wordLen = (key, model, overlay) => {
  const o = overlay && overlay[key];
  if (o && typeof o.value === 'string') return o.value.length;
  const w = ((model && model.words) || []).find((x) => x.key === key);
  return w && typeof w.value === 'string' ? w.value.length : 0;
};

export const repairStyleRanges = (styles, model, overlay) => {
  if (!Array.isArray(styles) || styles.length === 0) return [];
  const words = (model && model.words) || [];
  const orderIndex = new Map(words.map((w, i) => [w.key, i]));
  const deleted = deletedKeys(model, overlay);
  const alive = (key) => orderIndex.has(key) && !deleted.has(key);

  // nearest surviving word with model order >= idx (forward) or <= idx (backward)
  const nearestForward = (idx) => {
    for (let i = idx; i < words.length; i += 1) if (alive(words[i].key)) return words[i].key;
    return null;
  };
  const nearestBackward = (idx) => {
    for (let i = idx; i >= 0; i -= 1) if (alive(words[i].key)) return words[i].key;
    return null;
  };

  const out = [];
  styles.forEach((sr) => {
    let { fromKey, toKey } = sr;
    const fi = orderIndex.get(fromKey);
    const ti = orderIndex.get(toKey);
    if (fi == null || ti == null) return; // anchor not from this model at all -> drop
    let fromOffset = typeof sr.fromOffset === 'number' ? sr.fromOffset : 0;
    let toOffset = typeof sr.toOffset === 'number' ? sr.toOffset : wordLen(toKey, model, overlay);

    const fAlive = alive(fromKey);
    const tAlive = alive(toKey);
    if (!fAlive && !tAlive) {
      const f2 = nearestForward(fi);
      const t2 = nearestBackward(ti);
      if (!f2 || !t2 || orderIndex.get(f2) > orderIndex.get(t2)) return; // nothing alive inside -> drop
      fromKey = f2;
      fromOffset = 0;
      toKey = t2;
      toOffset = wordLen(t2, model, overlay);
    } else if (!fAlive) {
      const f2 = nearestForward(fi);
      if (!f2 || orderIndex.get(f2) > ti) return;
      fromKey = f2;
      fromOffset = 0;
    } else if (!tAlive) {
      const t2 = nearestBackward(ti);
      if (!t2 || orderIndex.get(t2) < fi) return;
      toKey = t2;
      toOffset = wordLen(t2, model, overlay);
    }

    // clamp sub-offsets against current word lengths; drop a now-zero-width same-word range
    fromOffset = Math.max(0, Math.min(fromOffset, wordLen(fromKey, model, overlay)));
    toOffset = Math.max(0, Math.min(toOffset, wordLen(toKey, model, overlay)));
    if (fromKey === toKey && toOffset <= fromOffset) return;
    out.push({ ...sr, fromKey, fromOffset, toKey, toOffset });
  });
  return out;
};

export default repairStyleRanges;
