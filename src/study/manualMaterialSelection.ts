import type { MaterialProgressRow, MaterialProgressSubject } from './materialProgress.ts';

export interface ManualMaterialChoice {
  id: string;
  subject: MaterialProgressSubject;
  value: string;
  book?: string;
}

function stripSubjectPrefix(title: string, prefix: string): string {
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

export function manualMaterialChoice(row: MaterialProgressRow): ManualMaterialChoice | null {
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

  return null;
}

export function selectedManualMaterialChoices(
  rows: readonly MaterialProgressRow[],
  selectedIds: readonly string[],
): ManualMaterialChoice[] {
  const selected = new Set(selectedIds);
  return rows
    .filter(row => selected.has(row.id))
    .map(manualMaterialChoice)
    .filter((choice): choice is ManualMaterialChoice => choice !== null);
}

export function includeCurrentMaterialValue(values: readonly string[], current: unknown): string[] {
  const normalized = [...new Set(values.filter(Boolean))];
  const currentValue = String(current ?? '').trim();
  if (currentValue && !normalized.includes(currentValue)) normalized.push(currentValue);
  return normalized;
}

