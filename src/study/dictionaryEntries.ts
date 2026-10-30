/** Local dictionary selection and legacy attribution contract; contains no backend credentials. */
export {
  DICTIONARY_PARTS, ECDICT_SOURCE_URL, cambridgeDictionaryUrl, dictionaryQuery, dictionaryResult, dictionarySource,
  type DictionaryLookupResult, type DictionaryMeaning, type DictionaryPartOfSpeech,
  type DictionaryProvider, type DictionarySourceProvider, type DictionarySourceReference,
} from '../../supabase/functions/_shared/dictionaryEntries.ts';
