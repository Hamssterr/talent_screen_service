export function normalizeRequiredSkills(skills?: string[]): string[] {
  if (!skills || !Array.isArray(skills)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of skills) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 100) continue;

    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(trimmed);
      if (normalized.length >= 50) break;
    }
  }

  return normalized;
}
