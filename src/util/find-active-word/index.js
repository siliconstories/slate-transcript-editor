/**
 * Find the index of the word being spoken at `currentTime`.
 *
 * The active word is the last word whose `start <= currentTime` — i.e. a word
 * stays highlighted from its start until the next word begins, so there are no
 * un-highlighted gaps between words.
 *
 * `wordMap` must be sorted ascending by `start` (buildWordMap produces it in
 * document order, which is time order for a well-formed transcript). Uses
 * binary search, so it is cheap to call on every media `timeupdate`.
 *
 * @param {Array<{start:number}>} wordMap
 * @param {number} currentTime - seconds
 * @returns {number} index into wordMap, or -1 before the first word starts
 */
const findActiveWord = (wordMap, currentTime) => {
  if (!Array.isArray(wordMap) || wordMap.length === 0) return -1;
  if (typeof currentTime !== 'number' || currentTime < wordMap[0].start) return -1;

  let lo = 0;
  let hi = wordMap.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (wordMap[mid].start <= currentTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
};

export default findActiveWord;
