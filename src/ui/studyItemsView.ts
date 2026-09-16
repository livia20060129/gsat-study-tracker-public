export const STUDY_ITEMS_VIEWS = ['today', 'week'] as const;

export type StudyItemsView = typeof STUDY_ITEMS_VIEWS[number];

export function normalizeStudyItemsView(value: unknown): StudyItemsView {
  return STUDY_ITEMS_VIEWS.includes(value as StudyItemsView) ? value as StudyItemsView : 'today';
}

export function studyItemsViewIndex(value: unknown): number {
  return STUDY_ITEMS_VIEWS.indexOf(normalizeStudyItemsView(value));
}

export function adjacentStudyItemsView(value: unknown, direction: 1 | -1): StudyItemsView {
  const index = studyItemsViewIndex(value);
  return STUDY_ITEMS_VIEWS[(index + direction + STUDY_ITEMS_VIEWS.length) % STUDY_ITEMS_VIEWS.length];
}
