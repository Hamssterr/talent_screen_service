import type { Readable } from 'stream';

export interface StoredDocument {
  key: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DocumentStorage {
  put(
    key: string,
    content: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StoredDocument>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const DOCUMENT_STORAGE_TOKEN = Symbol('DOCUMENT_STORAGE_TOKEN');
