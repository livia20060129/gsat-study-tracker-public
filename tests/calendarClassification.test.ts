import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCalendarEvent } from '../supabase/functions/_shared/calendarClassification.ts';

test('classifies New Key math from standardized notes even when the title has no legacy book prefix', () => {
  assert.equal(classifyCalendarEvent(
    '數學講義：進度',
    '【講義版本】新關鍵\n【冊別】3A-4A冊\n【頁碼範圍】31-57',
  ), 'math');
  assert.equal(classifyCalendarEvent(
    '指數與對數函數',
    '【講義版本】新關鍵 【冊別】1～2冊 【頁碼範圍】29–59',
  ), 'math');
  assert.equal(classifyCalendarEvent(
    '數學講義：進度',
    '【講義版本】智慧型 【冊別】2＋4A 【頁碼範圍】174–181',
  ), 'math');
});

test('recognizes grouped New Key book prefixes without misclassifying natural science', () => {
  assert.equal(classifyCalendarEvent('3A-4A｜矩陣'), 'math');
  assert.equal(classifyCalendarEvent('1～2｜多項式函數'), 'math');
  assert.equal(classifyCalendarEvent('物理｜牛頓運動定律', '【講義版本】新關鍵'), 'natural');
});

test('public lecture identifiers receive dedicated Calendar classification', () => {
  assert.equal(classifyCalendarEvent('矩陣', '【識別碼】GSAT-MATHA-NEW-DAMANFEN'), 'math');
  assert.equal(classifyCalendarEvent('酸鹼反應', '【識別碼】GSAT-CHEM-LINGHANG'), 'natural');
  assert.equal(classifyCalendarEvent('原子光譜', '【識別碼】GSAT-PHYS-YOUSHI'), 'natural');
  assert.equal(classifyCalendarEvent('複習', '【識別碼】GSAT-PHYS-NIZHUANSHENG'), 'natural');
});
