import assert from 'node:assert/strict';
import test from 'node:test';
import { UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import { omitStudyRanges, studyBookIncludes, studyHeadingText, studyReferenceText, studyTextIncludes } from '../src/ui/studyDisplayText.ts';

test('book identity recognizes existing catalog aliases and does not conflate different books', () => {
  assert.equal(studyBookIncludes('Unlock 3｜Unit 2 The environment（1/2）', UNLOCK_3_BOOK), true);
  assert.equal(studyBookIncludes('英文｜英文文法總複習｜Ch.6 假設語氣', '英文文法總複習講義'), true);
  assert.equal(studyBookIncludes('英文｜Unlock 30', UNLOCK_3_BOOK), false);
  assert.equal(studyBookIncludes('主題百匯：克漏字', '主題百匯：篇章結構·閱讀測驗'), false);
  assert.equal(studyBookIncludes('英文｜ACE Readings', 'ACE Reading'), false);
  assert.equal(studyBookIncludes('自訂教材｜Unit 2', '英文｜自訂教材'), true);
});

test('chapter comparisons cover Ch., Chapter and Chinese ordinals without confusing numeric prefixes', () => {
  assert.equal(studyTextIncludes('Azar英文文法（中階）｜Ch.6 名詞與代名詞', '第六章：名詞與代名詞'), true);
  assert.equal(studyTextIncludes('Ch.10 不定詞', 'Chapter 10 不定詞'), true);
  assert.equal(studyTextIncludes('Unit 20', 'Unit 2'), false);
  assert.equal(studyTextIncludes('第 46 回', '第 4 回'), false);
  assert.equal(studyTextIncludes('國文｜古今悅讀一百 第 76 回', '第 76 回'), true);
});

test('editable ranges are primary while fractional parts, dates, editions and other scopes remain', () => {
  assert.equal(omitStudyRanges('英文｜ACE Reading 第 46 回', ['round']), '英文｜ACE Reading');
  assert.equal(omitStudyRanges('教材｜Unit 2–3｜p.36–46', ['unit', 'pages']), '教材');
  assert.equal(omitStudyRanges('教材｜單元 2、3｜第 36～46 頁｜回次：4–5', ['unit', 'pages', 'round']), '教材');
  assert.equal(omitStudyRanges('Unlock 3｜Unit 2 The environment（1/2）', ['pages']), 'Unlock 3｜Unit 2 The environment（1/2）');
  assert.equal(omitStudyRanges('2026/11/01｜Prism Reading 3｜Ch.6', ['pages']), '2026/11/01｜Prism Reading 3｜Ch.6');
});

test('manual selectors retain names and headings retain the subject and useful task text', () => {
  assert.equal(studyHeadingText('英文｜ACE Reading 第 46 回', ['ACE Reading'], ['round']), '英文');
  assert.equal(studyHeadingText('英文｜Unlock 3｜Unit 2', [UNLOCK_3_BOOK], ['unit']), '英文');
  assert.equal(studyHeadingText('閱讀摘要｜自訂教材｜Unit 2', ['自訂教材'], ['unit']), '閱讀摘要');
});

test('references omit repeated Unit and topic text, but retain additional chapters and errors', () => {
  const title = 'Unlock 3｜Unit 2 The environment（1/2）';
  assert.equal(studyReferenceText('Unit 2', [title]), '');
  assert.equal(studyReferenceText('The environment', [title]), '');
  assert.equal(studyReferenceText('Unit 2、Unit 3', [title]), 'Unit 3');
  assert.equal(studyReferenceText('The environment、Transport', [title]), 'Transport');
  assert.equal(studyReferenceText('頁碼不在已建立的教材範圍 p.2–270 內。', [title]), '頁碼不在已建立的教材範圍 p.2–270 內。');
  assert.equal(studyReferenceText('Vocabulary Building：聯想法、字彙', ['TOEFL托福決戰字彙3800']), 'Vocabulary Building：聯想法、字彙');
});

test('chapter mappings show names once with no repeated page suffixes or numeric scope echoes', () => {
  assert.equal(studyReferenceText('Chapter 6 假設語氣（p.84–89）、Review 2（Chapter 4–Chapter 6）（p.90–91）', ['英文｜Ch.6 假設語氣']), 'Review 2（Chapter 4–Chapter 6）');
  assert.equal(studyReferenceText('Unit 2–3｜The environment｜Transport', ['Unlock 3'], ['unit']), 'The environment｜Transport');
  assert.equal(studyReferenceText('單元1｜細胞構造（p.4–8）、單元1｜細胞功能（p.9–15）', []), '單元1｜細胞構造、細胞功能');
  assert.equal(studyReferenceText('Unit 2–3', [], ['unit']), '');
});
