import type { StudyItem, StudyRecord, StudyRecordSyncConflict } from '../types.ts';

interface ConflictPathPart {
  property: string;
  selector?: string;
}

interface ResolvedConflictPath {
  value: unknown;
  itemLabels: string[];
}

const FIELD_LABELS: Record<string, string> = {
  date: '日期',
  mood: '今日狀態',
  englishTaskChoice: '混合題／模考選擇',
  wakeTime: '起床時間',
  bedtime: '就寢時間',
  time: '時間',
  dateTime: '實際日期時間',
  nextDay: '隔日凌晨狀態',
  biggestBlock: '今日最大卡點',
  firstThingTomorrow: '明天第一件事',
  notes: '其他補充',
  items: '讀書項目清單',
  title: '項目名稱',
  description: '項目說明',
  done: '完成勾選',
  minutes: '讀書時間（分鐘）',
  required: '是否計入完成率',
  deferred: '延期狀態',
  deferredTargetDay: '延期目標日',
  deferredCarry: '延期項目',
  checkedOn: '完成日期',
  deferredCompletedOn: '完成日期',
  subject: '科目',
  material: '講義版本',
  book: '冊別／書籍',
  start: '起始頁',
  end: '結束頁',
  unit: '單元',
  chapter: '章節',
  topic: '主題',
  round: '回次／Test',
  progress: '進度勾選',
  graded: '批改勾選',
  corrected: '訂正勾選',
  review: '再複習勾選',
  reason: '錯因／不熟觀念',
  score: '分數',
  essayScore: '作文分數範圍',
  mixedScore: '混合題分數',
  priorityFix: '優先修改錯誤',
  writingType: '題型',
  improvement: '改進方向',
  result: '作答結果',
  correctCount: '答對題數',
  errorConceptGrammar: '錯誤觀念／文法',
  words: '單字與搭配詞清單',
  text: '單字／搭配詞文字',
  entries: '雜誌紀錄清單',
  name: '名稱',
  month: '月份',
  timeTracking: '計時紀錄',
  groupedWorkEntries: '子項目清單',
  dailyWorkSourceItems: '原始項目清單',
  makeupEntries: '補做項目清單',
  reviewEntries: '訂正項目清單',
  interactiveEntries: '互動題清單',
  calendarIntegrationEntries: '自然分科項目清單',
  noun: '詞性：名詞',
  verb: '詞性：動詞',
  adjective: '詞性：形容詞',
  adverb: '詞性：副詞',
  preposition: '詞性：介系詞',
  conjunction: '詞性：連接詞',
  fixedCombination: '固定搭配標記',
  beautifulSentences: '佳句標記',
};

const CONFLICT_KIND_LABELS: Record<StudyRecordSyncConflict['kind'], string> = {
  'same-field': '本機與雲端同時修改',
  'delete-vs-edit': '一端移除、另一端修改',
  'unkeyed-array': '清單兩端同時變更',
  'unknown-base': '缺少共同版本，無法自動合併',
};

function pathParts(path: string): ConflictPathPart[] {
  const normalized = path.replace(/^\$\.?/, '');
  if (!normalized) return [];
  return normalized.split('.').map(part => {
    const match = part.match(/^([^[]+)(?:\[([^\]]+)\])?$/);
    return { property: match?.[1] ?? part, ...(match?.[2] ? { selector: match[2] } : {}) };
  });
}

function semanticEntryKey(value: Record<string, unknown>): string {
  return ['type', 'title', 'subject', 'material', 'source', 'name', 'unit', 'word']
    .map(key => String(value[key] ?? '').trim())
    .join('|');
}

function selectedEntry(values: unknown, selector: string): unknown {
  if (!Array.isArray(values)) return undefined;
  const separator = selector.indexOf(':');
  if (separator < 0) return undefined;
  const key = selector.slice(0, separator);
  const expected = selector.slice(separator + 1);
  return values.find(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    if (key === 'semantic') return semanticEntryKey(entry) === expected;
    return String(entry[key] ?? '') === expected;
  });
}

function itemLabel(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const item = value as StudyItem;
  const fields = item.f && typeof item.f === 'object' ? item.f : {};
  const bookTitle = String(fields.title ?? fields.book ?? item.title ?? '').trim();
  const sectionCode = String(fields.azarSectionCode ?? '').trim();
  const sectionTitle = String(fields.azarSectionTitle ?? '').trim();
  if (sectionCode && bookTitle) return `${bookTitle}｜${sectionCode}${sectionTitle}`;
  if (item.title) return item.title;
  if (bookTitle) return bookTitle;
  const subject = String(fields.subject ?? '').trim();
  const material = String(fields.material ?? '').trim();
  if (subject || material) return [subject, material].filter(Boolean).join('｜');
  return String(item.id ?? '').trim();
}

function resolveConflictPath(record: StudyRecord | null | undefined, path: string): ResolvedConflictPath {
  let current: unknown = record;
  const labels: string[] = [];
  for (const part of pathParts(path)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[part.property];
    if (!part.selector) continue;
    current = selectedEntry(current, part.selector);
    if (['items', 'groupedWorkEntries', 'dailyWorkSourceItems', 'makeupEntries', 'reviewEntries', 'interactiveEntries'].includes(part.property)) {
      const label = itemLabel(current);
      if (label && labels.at(-1) !== label) labels.push(label);
    }
  }
  return { value: current, itemLabels: labels };
}

function finalPathProperty(path: string): string {
  return pathParts(path).at(-1)?.property ?? '';
}

function fieldLabel(conflict: StudyRecordSyncConflict): string {
  if (!conflict.path || conflict.path === '$') return '整日紀錄';
  const property = finalPathProperty(conflict.path);
  if (conflict.path.includes('.bedtime.')) {
    const detail = property === 'time' ? '顯示時間' : property === 'dateTime' ? '實際日期時間' : '隔日凌晨狀態';
    return `就寢時間（${detail}）`;
  }
  if (/\]$/.test(conflict.path)) {
    if (property === 'items') return '整張讀書卡';
    if (property === 'words') return '整筆單字／搭配詞';
    return FIELD_LABELS[property] ?? '整筆項目';
  }
  return FIELD_LABELS[property] ?? `欄位「${property || conflict.path}」`;
}

function conflictLocation(
  conflict: StudyRecordSyncConflict,
  local: StudyRecord | null | undefined,
  cloud: StudyRecord | null | undefined,
): string {
  const localPath = resolveConflictPath(local, conflict.path);
  const cloudPath = resolveConflictPath(cloud, conflict.path);
  const labels = localPath.itemLabels.length > 0 ? localPath.itemLabels : cloudPath.itemLabels;
  return [...labels, fieldLabel(conflict)].filter(Boolean).join(' › ');
}

function compactArray(value: unknown[], path: string): string {
  if (path.includes('.words')) {
    const words = value
      .map(entry => typeof entry === 'string' ? entry : String((entry as Record<string, unknown>)?.text ?? ''))
      .filter(Boolean)
      .slice(0, 3);
    if (words.length > 0) return `${value.length} 筆（${words.join('、')}${value.length > 3 ? '…' : ''}）`;
  }
  const simple = value.filter(entry => ['string', 'number', 'boolean'].includes(typeof entry)).slice(0, 3);
  if (simple.length === value.length && simple.length > 0) return simple.join('、');
  return `${value.length} 項資料`;
}

function conflictValueText(conflict: StudyRecordSyncConflict, side: 'local' | 'cloud'): string {
  if (!conflict[`${side}Exists`]) return '未設定／已移除';
  const value = conflict[side];
  if (value === '') return '已清空';
  if (value === null) return '空值';
  const property = finalPathProperty(conflict.path);
  if (typeof value === 'boolean') {
    if (['done', 'progress', 'graded', 'corrected', 'review'].includes(property)) return value ? '已勾選' : '未勾選';
    return value ? '是' : '否';
  }
  if (Array.isArray(value)) return compactArray(value, conflict.path);
  if (typeof value === 'object') return '內容已變更';
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function studyRecordConflictLocations(
  conflicts: StudyRecordSyncConflict[],
  local?: StudyRecord | null,
  cloud?: StudyRecord | null,
): string[] {
  return [...new Set(conflicts.map(conflict => conflictLocation(conflict, local, cloud)))];
}

export function studyRecordConflictSummary(
  date: string,
  conflicts: StudyRecordSyncConflict[],
  local?: StudyRecord | null,
  cloud?: StudyRecord | null,
): string {
  if (conflicts.length === 0) {
    return `${date} 缺少共同版本，無法安全判斷欄位差異。兩端資料都已保留。`;
  }
  const locations = studyRecordConflictLocations(conflicts, local, cloud);
  const visible = locations.slice(0, 3).join('、');
  const remainder = locations.length > 3 ? `，另有 ${locations.length - 3} 個欄位` : '';
  return `${date} 有 ${conflicts.length} 個欄位衝突：${visible}${remainder}。兩端資料都已保留，請比較後選擇整日版本。`;
}

export function studyRecordConflictDetailsText(
  conflicts: StudyRecordSyncConflict[],
  local?: StudyRecord | null,
  cloud?: StudyRecord | null,
): string {
  return conflicts.slice(0, 12).map((conflict, index) => {
    const location = conflictLocation(conflict, local, cloud);
    const kind = CONFLICT_KIND_LABELS[conflict.kind];
    return `${index + 1}. ${location}（${kind}）\n本機：${conflictValueText(conflict, 'local')}\n雲端：${conflictValueText(conflict, 'cloud')}`;
  }).join('\n\n');
}
