import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedManualMaterialChoices } from '../src/study/manualMaterialSelection.ts';
import { builtInMaterialCatalog, materialProgressRows } from '../src/study/materialProgress.ts';
import { CATALOG_SUBJECTS, catalogGroups, catalogMaterialMatchesItem, type CatalogMaterial } from '../src/study/materialCatalog.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

const uuid = '12345678-1234-4234-8234-123456789012';
function material(subject: CatalogMaterial['subject'], index = 0): CatalogMaterial {
  return { id: index ? `custom:${uuid}-${index}` : `custom:${uuid}`, subject,
    title: `${subject}自編講義：第一冊｜進階 & <重點> 📘`, group: catalogGroups(subject)[0],
    mode: 'pages', total: 20, sections: [{ id: 'chapter', start: 1, end: 20, topic: '第一章', detail: '' }],
    revision: 1, updatedAt: '2026-11-15T01:00:00Z' };
}

test('all ten subjects use the real selected catalog title instead of an internal identifier', () => {
  const catalog = CATALOG_SUBJECTS.map((subject, index) => material(subject, index));
  const rows = materialProgressRows([{ date: '2026-11-15', items: [], materialCatalog: catalog }]);
  const choices = selectedManualMaterialChoices(rows, catalog.map(entry => entry.id), catalog);
  assert.equal(choices.length, catalog.length);
  for (const entry of catalog) {
    const choice = choices.find(current => current.id === entry.id)!;
    assert.equal(choice.value, ['公民', '歷史', '地理'].includes(entry.subject) ? `${entry.subject}｜${entry.title}` : entry.title);
    assert.ok(!choice.value.includes(uuid));
    if (['生物', '物理', '化學', '地科', '公民', '歷史', '地理'].includes(entry.subject)) assert.equal(choice.book, entry.subject);
  }
  assert.equal(selectedManualMaterialChoices(rows, [], catalog).length, 0);
});

test('renamed built-ins keep the current title, subject and original volume identity', () => {
  const original = builtInMaterialCatalog().find(entry => entry.id === 'math:對話式:1')!;
  const renamed = { ...original, title: '自編數學上冊', revision: 1 };
  const rows = materialProgressRows([{ date: '2026-11-15', items: [], materialCatalog: [renamed] }]);
  const [choice] = selectedManualMaterialChoices(rows, [original.id], [renamed]);
  assert.equal(choice.value, renamed.title);
  assert.equal(choice.book, '1');
  assert.equal(choice.group, '分冊講義');
});

test('reset and deleted catalog overrides cannot leak obsolete titles back into the selector', () => {
  const original = builtInMaterialCatalog().find(entry => entry.id === 'math:對話式:1')!;
  const reset = { ...original, title: '過期名稱', reset: true, revision: 2 };
  const deleted = { ...material('物理'), deleted: true };
  const rows = materialProgressRows([{ date: '2026-11-15', items: [], materialCatalog: [reset, deleted] }]);
  const choices = selectedManualMaterialChoices(rows, [reset.id, deleted.id], [reset, deleted]);
  assert.deepEqual(choices, [{ id: original.id, subject: 'math', value: '對話式', book: '1' }]);
});

test('old math cards saved with the catalog UUID still resolve their real book and page coverage without mutating input', () => {
  const entry = material('數學');
  const item: StudyItem = { id: 'legacy-card', type: 'mathLecture', source: 'custom', done: true, minutes: '17', required: false,
    checkedOn: '2026-11-15', f: { material: uuid, start: '1', end: '10', corrected: true, reason: '保留原筆記' } };
  const record: StudyRecord = { date: '2026-11-15', items: [item], materialCatalog: [entry] };
  const before = structuredClone(record);
  assert.equal(catalogMaterialMatchesItem(entry, item), true);
  assert.equal(materialProgressRows([record]).find(row => row.id === entry.id)!.completionPercent, 50);
  assert.deepEqual(record, before);
});

test('legacy UUID recovery cannot bind a different subject, schedule, catalog identity or arbitrary material name', () => {
  const entry = material('數學');
  const item: StudyItem = { id: 'legacy-card', type: 'mathLecture', source: 'custom', done: false, minutes: '', required: false, f: { material: uuid } };
  assert.equal(catalogMaterialMatchesItem(material('物理'), item), false);
  assert.equal(catalogMaterialMatchesItem(entry, { ...item, source: 'preset' }), false);
  assert.equal(catalogMaterialMatchesItem(entry, { ...item, f: { ...item.f, catalogMaterialId: 'custom:another' } }), false);
  assert.equal(catalogMaterialMatchesItem(entry, { ...item, f: { material: '未知講義' } }), false);
});
