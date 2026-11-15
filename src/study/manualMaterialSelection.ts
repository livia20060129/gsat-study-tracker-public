import type { MaterialProgressRow, MaterialProgressSubject } from './materialProgress.ts';
import type { CatalogMaterial } from './materialCatalog.ts';

export interface ManualMaterialChoice {
  id: string;
  subject: MaterialProgressSubject;
  value: string;
  book?: string;
  group?: MaterialProgressRow['group'];
}

function stripSubjectPrefix(title: string, prefix: string): string {
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

export function manualMaterialChoice(row: MaterialProgressRow, material?: CatalogMaterial): ManualMaterialChoice | null {
  if (material && material.id === row.id && !material.deleted && !material.reset) {
    let value = material.title;
    let book: string | undefined;
    if (row.subject === 'math') book = material.match?.book;
    if (row.subject === 'natural' || row.subject === 'social') book = material.subject;
    if (row.subject === 'social') value = `${material.subject}｜${material.title}`;
    return { id: row.id, subject: row.subject, value, group: row.group, ...(book ? { book } : {}) };
  }
  // Custom IDs are opaque; they never contain a material name or volume.
  if (row.id.startsWith('custom:')) return null;
  if (row.subject === 'chinese') {
    return {
      id: row.id,
      subject: row.subject,
      value: row.id === 'chinese:gujin' ? 'reading' : stripSubjectPrefix(row.title, '國文｜'),
    };
  }

  if (row.subject === 'english') {
    return {
      id: row.id,
      subject: row.subject,
      value: stripSubjectPrefix(row.title, '英文｜'),
    };
  }

  if (row.subject === 'math') {
    const [, material = '', book = ''] = row.id.split(':');
    if (!material) return null;
    return {
      id: row.id,
      subject: row.subject,
      value: material,
      ...(book ? { book } : {}),
    };
  }

  if (row.subject === 'natural') {
    const [, naturalSubject = '', material = ''] = row.id.split(':');
    if (!naturalSubject || !material) return null;
    return {
      id: row.id,
      subject: row.subject,
      value: material,
      book: naturalSubject,
    };
  }

  if (row.subject === 'social') {
    const [socialSubject = '', material = ''] = row.title.split('｜');
    if (!socialSubject || !material) return null;
    return {
      id: row.id,
      subject: row.subject,
      value: row.title,
      book: socialSubject,
    };
  }

  return null;
}

export function selectedManualMaterialChoices(
  rows: readonly MaterialProgressRow[],
  selectedIds: readonly string[],
  catalog: readonly CatalogMaterial[] = [],
): ManualMaterialChoice[] {
  const selected = new Set(selectedIds);
  const materials = new Map(catalog.map(material => [material.id, material]));
  return rows
    .filter(row => selected.has(row.id))
    .map(row => manualMaterialChoice(row, materials.get(row.id)))
    .filter((choice): choice is ManualMaterialChoice => choice !== null);
}

export function includeCurrentMaterialValue(values: readonly string[], current: unknown): string[] {
  const normalized = [...new Set(values.filter(Boolean))];
  const currentValue = String(current ?? '').trim();
  if (currentValue && !normalized.includes(currentValue)) normalized.push(currentValue);
  return normalized;
}

