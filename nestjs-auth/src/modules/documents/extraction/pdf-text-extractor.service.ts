import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'stream';
import {
  DocumentExtractionResult,
  DocumentTextExtractor,
  ExtractedPage,
} from './document-text-extractor.interface';
import {
  PdfExtractionError,
  PdfExtractionErrorCode,
} from './pdf-extraction.error';
import { readStreamWithLimit } from './stream-limit.util';

interface PdfTextItem {
  str: string;
}

interface PdfTextContent {
  items: (PdfTextItem | Record<string, unknown>)[];
}

interface PdfPage {
  getTextContent(params?: {
    disableCombineTextItems?: boolean;
  }): Promise<PdfTextContent>;
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  cleanup(): void;
  destroy(): Promise<void>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface PdfJsLibrary {
  getDocument(params: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    verbosity?: number;
  }): PdfLoadingTask;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const pdfjsLib: PdfJsLibrary =
  require('pdfjs-dist/legacy/build/pdf.js') as PdfJsLibrary;
/* eslint-enable @typescript-eslint/no-require-imports */

@Injectable()
export class PdfTextExtractorService implements DocumentTextExtractor {
  private readonly logger = new Logger(PdfTextExtractorService.name);

  private readonly DEFAULT_MAX_PAGES = 20;
  private readonly DEFAULT_MAX_TEXT_CHARS = 50000;
  private readonly DEFAULT_MAX_SIZE_BYTES = 10485760; // 10MB
  private readonly DEFAULT_TIMEOUT_MS = 30000; // 30s

  async extract(
    stream: Readable,
    options?: {
      maxPages?: number;
      maxTextChars?: number;
      maxSizeBytes?: number;
      timeoutMs?: number;
    },
  ): Promise<DocumentExtractionResult> {
    const maxPages = options?.maxPages ?? this.DEFAULT_MAX_PAGES;
    const maxTextChars = options?.maxTextChars ?? this.DEFAULT_MAX_TEXT_CHARS;
    const maxSizeBytes = options?.maxSizeBytes ?? this.DEFAULT_MAX_SIZE_BYTES;
    const timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;

    // 1. Đọc stream vào Buffer có giới hạn byte
    const buffer = await readStreamWithLimit(stream, maxSizeBytes);

    // 2. Chuyển sang Uint8Array cho pdfjs-dist
    const uint8Array = new Uint8Array(buffer);

    // 3. Thực hiện parse với timeout
    return this.parsePdfWithTimeout(
      uint8Array,
      maxPages,
      maxTextChars,
      timeoutMs,
    );
  }

  private async parsePdfWithTimeout(
    data: Uint8Array,
    maxPages: number,
    maxTextChars: number,
    timeoutMs: number,
  ): Promise<DocumentExtractionResult> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new PdfExtractionError(
            PdfExtractionErrorCode.TIMEOUT,
            `PDF parsing timed out after ${timeoutMs}ms`,
            { timeoutMs },
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        this.parsePdf(data, maxPages, maxTextChars),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async parsePdf(
    data: Uint8Array,
    maxPages: number,
    maxTextChars: number,
  ): Promise<DocumentExtractionResult> {
    let loadingTask: PdfLoadingTask | null = null;
    let doc: PdfDocument | null = null;

    try {
      loadingTask = pdfjsLib.getDocument({
        data,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
        verbosity: 0, // Tắt log cảnh báo nội bộ của pdfjs
      });

      try {
        doc = await loadingTask.promise;
      } catch (loadErr: unknown) {
        const errObj = loadErr as
          { message?: string; name?: string } | undefined;
        const errMsg = errObj?.message?.toLowerCase() || '';
        const errName = errObj?.name || '';

        if (
          errName === 'PasswordException' ||
          errMsg.includes('password') ||
          errMsg.includes('encrypted')
        ) {
          throw new PdfExtractionError(
            PdfExtractionErrorCode.ENCRYPTED,
            'Tài liệu PDF được bảo vệ bằng mật khẩu hoặc bị mã hóa',
            { cause: errObj?.message },
          );
        }

        if (
          errName === 'InvalidPDFException' ||
          errMsg.includes('invalid pdf') ||
          errMsg.includes('corrupted')
        ) {
          throw new PdfExtractionError(
            PdfExtractionErrorCode.CORRUPTED,
            'Tài liệu PDF không hợp lệ hoặc bị hỏng',
            { cause: errObj?.message },
          );
        }

        throw new PdfExtractionError(
          PdfExtractionErrorCode.UNKNOWN,
          `Không thể mở tài liệu PDF: ${errObj?.message || 'Lỗi không xác định'}`,
          { cause: errObj?.message },
        );
      }

      const numPages = doc.numPages;

      // Kiểm tra giới hạn số trang
      if (numPages > maxPages) {
        throw new PdfExtractionError(
          PdfExtractionErrorCode.PAGE_LIMIT_EXCEEDED,
          `Số trang PDF (${numPages}) vượt quá giới hạn cho phép (${maxPages} trang)`,
          { pageCount: numPages, maxPages },
        );
      }

      const pages: ExtractedPage[] = [];
      let totalExtractedLength = 0;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        try {
          const textContent = await page.getTextContent({
            disableCombineTextItems: false,
          });

          const pageItems: string[] = [];
          for (const item of textContent.items) {
            if ('str' in item && typeof item.str === 'string') {
              pageItems.push(item.str);
            }
          }

          // Chuẩn hóa khoảng trắng: thay thế chuỗi khoảng trắng/tab bằng 1 space, chuẩn hóa newline
          const rawPageText = pageItems.join(' ');
          const normalizedPageText = this.normalizeWhitespace(rawPageText);

          // Cắt nếu tổng ký tự vượt quá maxTextChars
          let finalPageText = normalizedPageText;
          if (totalExtractedLength + finalPageText.length > maxTextChars) {
            const remaining = Math.max(0, maxTextChars - totalExtractedLength);
            finalPageText = finalPageText.slice(0, remaining);
          }

          totalExtractedLength += finalPageText.length;
          pages.push({
            pageNumber: pageNum,
            text: finalPageText,
          });
        } finally {
          page.cleanup();
        }
      }

      // Kiểm tra text có ý nghĩa (phát hiện PDF scan hoặc chỉ có hình ảnh)
      const allText = pages.map((p) => p.text).join(' ');
      const hasMeaningfulText = this.checkMeaningfulText(allText);

      if (!hasMeaningfulText) {
        throw new PdfExtractionError(
          PdfExtractionErrorCode.NO_MEANINGFUL_TEXT,
          'Tài liệu PDF không chứa văn bản có thể trích xuất (có thể là bản scan hoặc hình ảnh)',
          { totalCharacters: allText.length },
        );
      }

      // Tạo combinedText có page marker chuẩn
      const combinedText = pages
        .map((p) => `[PAGE ${p.pageNumber}]\n${p.text}`)
        .join('\n\n');

      return {
        pageCount: numPages,
        pages,
        combinedText,
      };
    } finally {
      // Giải phóng bộ nhớ và tài nguyên của loading task & doc
      if (doc) {
        try {
          doc.cleanup();
          await doc.destroy();
        } catch {
          // Bỏ qua lỗi dọn dẹp
        }
      }
      if (loadingTask) {
        try {
          await loadingTask.destroy();
        } catch {
          // Bỏ qua lỗi dọn dẹp
        }
      }
    }
  }

  /**
   * Chuẩn hóa khoảng trắng: loại bỏ ký tự điều khiển lạ, thu gọn multi-space
   */
  private normalizeWhitespace(text: string): string {
    return text
      .replace(/[\r\t\f\v]/g, ' ')
      .replace(/[ \u00A0]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Kiểm tra văn bản có ý nghĩa hay không:
   * Phải có ít nhất 50 ký tự và chứa từ ngữ ký tự chữ số
   */
  private checkMeaningfulText(text: string): boolean {
    const cleaned = text.trim();
    if (cleaned.length < 50) {
      return false;
    }
    // Có ít nhất 10 từ gồm chữ cái hoặc chữ số
    const words = cleaned.split(/\s+/).filter((w) => /[a-zA-Z0-9À-ỹ]/.test(w));
    return words.length >= 10;
  }
}
