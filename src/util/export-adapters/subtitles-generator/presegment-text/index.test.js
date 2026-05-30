'use strict';
import fs from 'fs';
import path from 'path';
import preSegmentText from './index.js';
// requrie on js and json is relative to current file path
import { words as sampleWords } from '../sample/words-list.sample.json';
// resolve relative to this test file so it works regardless of cwd
const sampleSegmentedOutput = fs.readFileSync(path.join(__dirname, '../sample/test-presegment.sample.txt')).toString();

const numberOfCharPerLine35 = 35;
// TODO: not sure why Jest is having issues running this test
describe.skip('presegment text', () => {
  test('presegment text ', () => {
    const result = preSegmentText(sampleWords);
    expect(result).toEqual(sampleSegmentedOutput);
  });

  test('presegment text - 35', () => {
    const result = preSegmentText(sampleWords, numberOfCharPerLine35);
    expect(result).toEqual(sampleSegmentedOutput);
  });
});
