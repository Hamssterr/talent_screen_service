import { ExtractedPage } from '../../../documents/extraction/document-text-extractor.interface';
import { CvProfileV1Dto } from '../../../documents/schemas/cv-profile-v1.schema';
import { ProfileEvidenceValidationResult } from './profile-ai.types';

/**
 * Kiểm tra tính xác thực của các bằng chứng (evidence quote và page) được AI trích xuất.
 * Đảm bảo:
 * 1. Số trang tham chiếu phải nằm trong [1, pageCount].
 * 2. Đoạn trích dẫn (quote) phải thực sự xuất hiện trong nội dung văn bản của trang tương ứng.
 */
export function validateProfileEvidence(
  profile: CvProfileV1Dto,
  pages: ExtractedPage[],
): ProfileEvidenceValidationResult {
  const pageMap = new Map<number, string>();
  for (const p of pages) {
    pageMap.set(p.pageNumber, normalizeForComparison(p.text));
  }

  const minPage = 1;
  const maxPage = pages.length;

  // 1. Kiểm tra evidence trong skills
  for (const skill of profile.skills || []) {
    if (skill.evidence) {
      const result = validateSingleEvidence(
        `skills[${skill.name}]`,
        skill.evidence,
        minPage,
        maxPage,
        pageMap,
      );
      if (!result.isValid) {
        return result;
      }
    }
  }

  // 2. Kiểm tra evidence trong projects
  for (const project of profile.projects || []) {
    if (project.evidence) {
      const result = validateSingleEvidence(
        `projects[${project.name}]`,
        project.evidence,
        minPage,
        maxPage,
        pageMap,
      );
      if (!result.isValid) {
        return result;
      }
    }
  }

  return { isValid: true };
}

function validateSingleEvidence(
  field: string,
  evidence: { page?: number; quote?: string },
  minPage: number,
  maxPage: number,
  pageMap: Map<number, string>,
): ProfileEvidenceValidationResult {
  const page = evidence.page;
  const quote = evidence.quote;

  if (page !== undefined && page !== null) {
    if (page < minPage || page > maxPage) {
      return {
        isValid: false,
        reason: `Evidence tham chiếu trang ${page} không tồn tại (tài liệu chỉ có ${maxPage} trang)`,
        invalidEvidence: { field, page, quote },
      };
    }

    if (quote && quote.trim()) {
      const pageText = pageMap.get(page) || '';
      const normalizedQuote = normalizeForComparison(quote);

      if (normalizedQuote.length > 0 && !pageText.includes(normalizedQuote)) {
        return {
          isValid: false,
          reason: `Evidence quote không xuất hiện trong nội dung trang ${page} của tài liệu CV`,
          invalidEvidence: { field, page, quote },
        };
      }
    }
  } else if (quote && quote.trim()) {
    // Có quote nhưng không chỉ định trang
    const normalizedQuote = normalizeForComparison(quote);
    let foundInAnyPage = false;
    for (const [, text] of pageMap.entries()) {
      if (text.includes(normalizedQuote)) {
        foundInAnyPage = true;
        break;
      }
    }

    if (!foundInAnyPage) {
      return {
        isValid: false,
        reason: `Evidence quote không xuất hiện trong bất kỳ trang nào của tài liệu CV`,
        invalidEvidence: { field, quote },
      };
    }
  }

  return { isValid: true };
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n\t\f\v]/g, ' ')
    .replace(/[ \u00A0]+/g, ' ')
    .trim();
}
