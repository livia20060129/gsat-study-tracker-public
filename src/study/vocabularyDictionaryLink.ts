export type VocabularyDictionary = 'oxford' | 'cambridge';

export function vocabularyDictionaryLink(query: string, dictionary: VocabularyDictionary): { url: string; label: string } {
  const text = query.trim();
  if (dictionary === 'cambridge') return {
    url: text ? `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(text)}` : '',
    label: '劍橋中英字典',
  };
  return { url: text ? `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(text)}` : '',
    label: "Oxford Learner's Dictionaries" };
}
