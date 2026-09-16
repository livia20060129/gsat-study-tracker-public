import type { StudyItem, StudyItemFields } from '../../types.ts';

export interface MathPageFields extends StudyItemFields {
  material?: string;
  edition?: string;
  version?: string;
  book?: string;
  volume?: string;
  booklet?: string;
  start?: string | number;
  end?: string | number;
}

export interface MathStudyItem extends StudyItem {
  type: 'mathStudy';
  f: MathPageFields;
}

export interface MathLectureItem extends StudyItem {
  type: 'mathLecture';
  f: MathPageFields & { progress?: boolean };
}

export interface MathPracticeItem extends StudyItem {
  type: 'mathPractice';
  f: MathPageFields & {
    reason?: string;
    corrected?: boolean;
    review?: boolean;
    extended?: boolean;
  };
}

/** First incremental discriminated union; remaining legacy cards stay on StudyItem for now. */
export type MathPageStudyItem = MathStudyItem | MathLectureItem | MathPracticeItem;

export function isMathPageStudyItem(item: StudyItem): item is MathPageStudyItem {
  return item.type === 'mathStudy' || item.type === 'mathLecture' || item.type === 'mathPractice';
}

export function isMathProgressStudyItem(item: StudyItem): item is MathStudyItem | MathLectureItem {
  return item.type === 'mathStudy' || item.type === 'mathLecture';
}
