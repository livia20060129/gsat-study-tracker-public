/** Keep the study instructions before the generated Calendar source suffix. */
export function studyCardDescription(description?: string): string {
  return String(description || '').split(/(?:^|[｜|])\s*Google\s+Calendar\s+API\b/i)[0].trim();
}
