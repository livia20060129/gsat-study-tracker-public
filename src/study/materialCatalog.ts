import type { StudyItem, StudyRecord } from '../types.ts';

export const CATALOG_SUBJECTS = ['國文', '英文', '數學', '物理', '化學', '生物', '地科', '公民', '歷史', '地理'] as const;
export type CatalogSubject = typeof CATALOG_SUBJECTS[number];
export type CatalogMode = 'pages' | 'unit' | 'round';
export interface CatalogSection { id: string; start: number; end: number; topic: string; detail: string }
export interface CatalogMaterial {
  id: string; title: string; subject: CatalogSubject; group: string; mode: CatalogMode; total: number;
  sections: CatalogSection[]; revision: number; updatedAt: string; deleted?: boolean;
  /** Reset is a versioned change so an older override cannot reappear after synchronization. */
  reset?: boolean;
  match?: { title?: string; material?: string; book?: string; kind?: string };
}

export function catalogGroups(subject: CatalogSubject): string[] {
  if (subject === '英文') return ['學測', '補充'];
  if (subject === '數學') return ['複習講義', '分冊講義'];
  return subject === '國文' ? ['國文教材'] : [subject];
}

export function catalogProgressSubject(subject: CatalogSubject): 'chinese' | 'english' | 'math' | 'natural' | 'social' {
  if (subject === '國文') return 'chinese';
  if (subject === '英文') return 'english';
  if (subject === '數學') return 'math';
  if (['公民', '歷史', '地理'].includes(subject)) return 'social';
  return 'natural';
}

export function catalogModeNoun(mode: CatalogMode): string {
  if (mode === 'pages') return '頁';
  if (mode === 'unit') return 'Unit';
  return '回次';
}

export function catalogValidationError(material: CatalogMaterial): string {
  if (!material || typeof material.id !== 'string' || typeof material.title !== 'string' || !material.title.trim()) return '請填寫書名。';
  if (!CATALOG_SUBJECTS.includes(material.subject)) return '請選擇科目。';
  if (!catalogGroups(material.subject).includes(material.group)) return '請選擇此科目的教材分類。';
  if (!['pages', 'unit', 'round'].includes(material.mode)) return '請選擇範圍模板。';
  if (!Number.isSafeInteger(material.total) || material.total < 1 || (material.total > 10000 && material.id.startsWith('custom:'))) return '總頁數／Unit／回次請填入 1～10000 的整數。';
  if (!Array.isArray(material.sections)) return '章節資料格式不正確。';
  if (!Number.isSafeInteger(material.revision) || material.revision < 0 || typeof material.updatedAt !== 'string') return '教材版本資料格式不正確。';
  if (material.sections.some(section => !section || typeof section.topic !== 'string' || typeof section.detail !== 'string')) return '章節資料格式不正確。';
  if (material.sections.length > 2000) return '每本教材最多可設定 2000 個章節。';
  const ids = new Set<string>();
  const sorted = [...material.sections].sort((left, right) => left.start - right.start);
  for (const [index, section] of sorted.entries()) {
    if (!section || typeof section.topic !== 'string' || typeof section.detail !== 'string') return '章節資料格式不正確。';
    if (!section.id || ids.has(section.id)) return '章節識別碼重複，請重新新增該列。';
    ids.add(section.id);
    if (!section.topic.trim()) return `第 ${index + 1} 列請填寫大單元。`;
    if (!Number.isSafeInteger(section.start) || !Number.isSafeInteger(section.end)
      || section.start < 1 || section.end < section.start || section.end > material.total) return `第 ${index + 1} 列的範圍無效；結束值須大於或等於起始值，且不能超過總數。`;
    if (index > 0 && sorted[index - 1].end >= section.start) return `第 ${index + 1} 列與前一列範圍重疊。`;
  }
  return '';
}

export function catalogOverrides(records: readonly StudyRecord[]): CatalogMaterial[] {
  const latest = new Map<string, CatalogMaterial>();
  for (const record of records) {
    if (!Array.isArray(record.materialCatalog)) continue;
    for (const entry of record.materialCatalog ?? []) {
      if (!entry || typeof entry.id !== 'string' || !Array.isArray(entry.sections) || catalogValidationError(entry)) continue;
      const previous = latest.get(entry.id);
      if (!previous || entry.revision > previous.revision || (entry.revision === previous.revision && entry.updatedAt > previous.updatedAt)) latest.set(entry.id, entry);
    }
  }
  return [...latest.values()];
}

export function effectiveMaterialCatalog(builtins: readonly CatalogMaterial[], records: readonly StudyRecord[], includeDeleted = false): CatalogMaterial[] {
  const entries = new Map(builtins.map(entry => [entry.id, entry]));
  for (const entry of catalogOverrides(records)) {
    if (!entry.reset) entries.set(entry.id, entry);
  }
  return [...entries.values()].filter(entry => includeDeleted || !entry.deleted);
}

export function catalogMaterialMatchesItem(material: CatalogMaterial, item: StudyItem): boolean {
  const f = item.f ?? {};
  if (f.catalogMaterialId === material.id) return true;
  const match = material.match;
  if (!match) return false;
  if (material.subject === '國文' && item.type !== 'chineseReading') return false;
  if (material.subject === '英文' && !['extra', 'magazine', 'calendarStudy'].includes(item.type)) return false;
  if (material.subject === '數學' && !['mathStudy', 'mathLecture', 'mathPractice'].includes(item.type)) return false;
  if (['物理', '化學', '生物', '地科'].includes(material.subject) && (item.type !== 'scienceReview' || f.subject !== material.subject)) return false;
  if (['公民', '歷史', '地理'].includes(material.subject)
    && (!['socialStudy', 'general', 'calendarStudy'].includes(item.type) || f.subject !== material.subject)) return false;
  if (match.title && ![f.title, f.book, item.title].includes(match.title)) return false;
  if (match.material && f.material !== match.material) return false;
  if (match.book && f.book !== match.book) return false;
  if (match.kind && f.kind !== match.kind) return false;
  return true;
}

export function catalogItemFields(material: CatalogMaterial): StudyItem['f'] {
  return {
    // The directory owns the page map; individual cards need only a compact fallback identity.
    catalogMaterialId: material.id, catalogMaterialSnapshot: { ...material, sections: [] },
    title: material.title, subject: material.subject, scopeKind: material.mode,
    ...(material.subject === '數學' ? { material: material.title, book: '' } : {}),
    ...(['物理', '化學', '生物', '地科'].includes(material.subject) ? { material: material.title } : {}),
    ...(['公民', '歷史', '地理'].includes(material.subject) ? { book: material.title } : {}),
    ...(material.subject === '國文' ? { kind: 'book', book: material.title } : {}),
    start: '', end: '', unitStart: '', unitEnd: '', round: '', roundEnd: '',
  };
}

export function catalogItemType(material: CatalogMaterial): StudyItem['type'] {
  if (material.subject === '國文') return 'chineseReading';
  if (material.subject === '英文') return 'extra';
  if (material.subject === '數學') return 'mathLecture';
  if (['公民', '歷史', '地理'].includes(material.subject)) return 'socialStudy';
  return 'scienceReview';
}

export function catalogRange(material: CatalogMaterial, item: StudyItem): { start: number; end: number } {
  const fields = item.f;
  let start: unknown = fields.start;
  let end: unknown = fields.end;
  if (material.mode === 'unit') { start = fields.unitStart || fields.unit; end = fields.unitEnd || start; }
  if (material.mode === 'round') { start = fields.round; end = fields.roundEnd || start; }
  return { start: Number(start), end: Number(end || start) };
}

export function catalogRangeText(material: CatalogMaterial, item: StudyItem): string {
  const { start, end } = catalogRange(material, item);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return '尚未填寫範圍。';
  const sections = material.sections.filter(section => end >= section.start && start <= section.end);
  return sections.map(section => [section.topic, section.detail].filter(Boolean).join('｜')).join('；') || '此範圍尚未建立章節對照。';
}

export function catalogLargeSections(material: CatalogMaterial): CatalogSection[] {
  const source = material.sections.length ? material.sections : [{ id: 'all', start: 1, end: material.total, topic: '全冊', detail: '' }];
  const groups: CatalogSection[] = [];
  for (const section of [...source].sort((left, right) => left.start - right.start)) {
    const previous = groups.at(-1);
    if (previous?.topic === section.topic && previous.end + 1 === section.start) previous.end = section.end;
    else groups.push({ ...section, detail: '' });
  }
  return groups;
}
