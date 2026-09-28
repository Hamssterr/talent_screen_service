import type { Readable } from 'stream';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface DocumentExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  combinedText: string;
}

export interface DocumentTextExtractor {
  extract(
    stream: Readable,
    options?: {
      maxPages?: number;
      maxTextChars?: number;
      maxSizeBytes?: number;
      timeoutMs?: number;
    },
  ): Promise<DocumentExtractionResult>;
}

export const DOCUMENT_TEXT_EXTRACTOR = Symbol('DOCUMENT_TEXT_EXTRACTOR');
