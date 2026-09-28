import { createHash } from 'crypto';

/**
 * Chuẩn hóa (canonicalize) dữ liệu input để đảm bảo:
 * - Cùng logical input luôn cho ra cùng hash.
 * - Thứ tự key trong object không làm thay đổi hash.
 * - Mảng giữ nguyên thứ tự phần tử.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function computeInputHash(input: unknown): string {
  const canonical = canonicalize(input);
  const jsonString = JSON.stringify(canonical);
  return createHash('sha256').update(jsonString).digest('hex');
}
