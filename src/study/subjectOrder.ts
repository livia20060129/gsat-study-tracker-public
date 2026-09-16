import type { StudyItem } from '../types.ts';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function studyItemSubject(item: StudyItem): string {
  const type = text(item.type);
  const explicitSubject = text(item.f?.subject);
  if (/數學|數\s*A/.test(explicitSubject)) return '數學';
  if (/自然|物理|化學|生物|地科/.test(explicitSubject)) return '自然';
  if (/國文/.test(explicitSubject)) return '國文';
  if (/英文/.test(explicitSubject)) return '英文';
  if (/社會|歷史|地理|公民/.test(explicitSubject)) return '社會';
  const title = `${text(item.title)} ${text(item.f?.title)}`;
  if (/^math|數學|數\s*A/i.test(type) || /數學|數\s*A/.test(title)) return '數學';
  if (/science|biology|physics|chemistry|earth/i.test(type) || /自然|物理|化學|生物|地科/.test(title)) return '自然';
  if (/chinese/i.test(type) || /國文|古今悅讀/.test(title)) return '國文';
  if (/english|magazine|mock|extra/i.test(type) || /英文|英聽|單字|片語|文法|ACE Reading|Essential Grammar/i.test(title)) return '英文';
  return '其他';
}

export function studyItemSubjectClass(item: StudyItem): string {
  const subject = studyItemSubject(item);
  const tone = subject === '數學'
    ? 'math'
    : subject === '國文'
      ? 'chinese'
      : subject === '英文'
        ? 'english'
        : subject === '自然'
          ? 'natural'
          : 'other';
  return `subject-card subject-${tone}`;
}

/** Groups matching subjects together while preserving first-seen subject and item order. */
export function groupStudyItemsBySubject(items: StudyItem[]): StudyItem[] {
  const subjectOrder = new Map<string, number>();
  items.forEach(item => {
    const subject = studyItemSubject(item);
    if (!subjectOrder.has(subject)) subjectOrder.set(subject, subjectOrder.size);
  });
  return items
    .map((item, index) => ({ item, index, subject: studyItemSubject(item) }))
    .sort((left, right) => (subjectOrder.get(left.subject) ?? 0) - (subjectOrder.get(right.subject) ?? 0)
      || left.index - right.index)
    .map(entry => entry.item);
}
