import stripMutedWords from './index.js';

const para = (words, extra = {}) => ({
  type: 'timedText',
  speaker: 'Speaker 1',
  start: words.length ? words[0].start : 0,
  ...extra,
  children: [{ text: words.map((w) => w.text).join(' '), words }],
});

const w = (text, start, end, muted) => ({ text, start, end, ...(muted ? { muted: true } : {}) });

describe('stripMutedWords', () => {
  it('removes muted words and regenerates text', () => {
    const value = [para([w('keep', 1, 2), w('drop', 2, 3, true), w('this', 3, 4)])];
    const out = stripMutedWords(value);
    expect(out[0].children[0].words.map((x) => x.text)).toEqual(['keep', 'this']);
    expect(out[0].children[0].text).toBe('keep this');
  });

  it('does not mutate the input', () => {
    const value = [para([w('a', 1, 2), w('b', 2, 3, true)])];
    const before = JSON.parse(JSON.stringify(value));
    stripMutedWords(value);
    expect(value).toEqual(before);
  });

  it('keeps paragraphs with at least one unmuted word', () => {
    const value = [para([w('a', 1, 2, true), w('b', 2, 3)])];
    const out = stripMutedWords(value);
    expect(out.length).toBe(1);
    expect(out[0].children[0].text).toBe('b');
  });

  it('drops paragraphs where every word is muted', () => {
    const value = [para([w('a', 1, 2)]), para([w('x', 3, 4, true), w('y', 4, 5, true)], { start: 3 })];
    const out = stripMutedWords(value);
    expect(out.length).toBe(1);
    expect(out[0].children[0].text).toBe('a');
  });

  it('is a no-op when nothing is muted', () => {
    const value = [para([w('a', 1, 2), w('b', 2, 3)])];
    const out = stripMutedWords(value);
    expect(out[0].children[0].words.length).toBe(2);
    expect(out[0].children[0].text).toBe('a b');
  });

  it('handles non-array / malformed input', () => {
    expect(stripMutedWords(null)).toBe(null);
    expect(stripMutedWords([{}])).toEqual([]);
  });

  // rev.ai tier: words carry trailing punctuation on `punctAfter`
  const pw = (text, start, end, punctAfter, muted) => ({ text, start, end, punctAfter, ...(muted ? { muted: true } : {}) });

  it('rev.ai: includes punctuation in the regenerated text when nothing is muted', () => {
    const out = stripMutedWords([para([pw('the', 1, 2, ''), pw('cat', 2, 3, ','), pw('sat', 3, 4, '.')])]);
    expect(out[0].children[0].text).toBe('the cat, sat.');
  });

  it('rev.ai: muting a word followed by a space just drops it', () => {
    const out = stripMutedWords([para([pw('the', 1, 2, ''), pw('cat', 2, 3, '', true), pw('sat', 3, 4, '.')])]);
    expect(out[0].children[0].text).toBe('the sat.');
  });

  it('rev.ai: muting a word with trailing punctuation moves the punctuation onto the previous word', () => {
    const out = stripMutedWords([para([pw('the', 1, 2, ''), pw('cat', 2, 3, ''), pw('sat', 3, 4, '.', true)])]);
    expect(out[0].children[0].words.map((x) => x.text)).toEqual(['the', 'cat']);
    expect(out[0].children[0].text).toBe('the cat.');
  });

  it('rev.ai: muting the first word drops its trailing punctuation', () => {
    const out = stripMutedWords([para([pw('Hi', 1, 2, '.', true), pw('there', 2, 3, '')])]);
    expect(out[0].children[0].text).toBe('there');
  });
});
