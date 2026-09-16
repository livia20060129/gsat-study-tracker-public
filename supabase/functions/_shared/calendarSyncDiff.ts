/** Returns stored Google event keys that were not present in the latest complete fetch window. */
export function staleCalendarEventKeys(
  existingKeys: Iterable<string>,
  fetchedKeys: Iterable<string>,
): string[] {
  const fetched = new Set(fetchedKeys);
  return [...new Set(existingKeys)].filter((key) => !fetched.has(key));
}
