import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DocumentStorage, StoredDocument } from './document-storage.interface';

@Injectable()
export class LocalDocumentStorageService
  implements DocumentStorage, OnModuleInit
{
  private readonly logger = new Logger(LocalDocumentStorageService.name);
  private readonly rootDir: string;

  constructor(private readonly configService: ConfigService) {
    const rawRoot =
      this.configService.get<string>('storage.local.root') ||
      './data/private-documents';
    this.rootDir = path.resolve(process.cwd(), rawRoot);
  }

  onModuleInit() {
    this.ensureDirectoryExists(this.rootDir);
    this.logger.log(`Initialized LocalDocumentStorage at: ${this.rootDir}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private resolveSafePath(key: string): string {
    // Chặn null bytes
    if (key.includes('\0')) {
      throw new Error('Invalid storage key: null bytes detected');
    }

    // Chặn absolute path
    if (path.isAbsolute(key)) {
      throw new Error('Invalid storage key: absolute path not allowed');
    }

    // Normalize và resolve
    const resolvedPath = path.resolve(this.rootDir, key);

    // Kiểm tra path traversal
    if (
      !resolvedPath.startsWith(this.rootDir + path.sep) &&
      resolvedPath !== this.rootDir
    ) {
      throw new Error('Invalid storage key: path traversal detected');
    }

    // Kiểm tra symlink ngoài root nếu file hoặc thư mục cha tồn tại
    if (fs.existsSync(resolvedPath)) {
      const realPath = fs.realpathSync(resolvedPath);
      if (
        !realPath.startsWith(this.rootDir + path.sep) &&
        realPath !== this.rootDir
      ) {
        throw new Error('Invalid storage key: symlink traversal detected');
      }
    }

    return resolvedPath;
  }

  async put(
    key: string,
    content: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StoredDocument> {
    const targetPath = this.resolveSafePath(key);
    const parentDir = path.dirname(targetPath);
    this.ensureDirectoryExists(parentDir);

    // Không overwrite file đã tồn tại
    if (fs.existsSync(targetPath)) {
      throw new Error(`File already exists at key: ${key}`);
    }

    let size = 0;
    if (Buffer.isBuffer(content)) {
      await fs.promises.writeFile(targetPath, content, { flag: 'wx' });
      size = content.length;
    } else {
      const writeStream = fs.createWriteStream(targetPath, { flags: 'wx' });
      await pipeline(content, writeStream);
      const stat = await fs.promises.stat(targetPath);
      size = stat.size;
    }

    return {
      key,
      size,
      mimeType: (metadata?.mimeType as string) || 'application/pdf',
      createdAt: new Date(),
      metadata,
    };
  }

  async get(key: string): Promise<Readable> {
    const targetPath = this.resolveSafePath(key);
    try {
      await fs.promises.access(targetPath, fs.constants.R_OK);
    } catch {
      throw new Error(`Document not found for key: ${key}`);
    }
    return fs.createReadStream(targetPath);
  }

  async delete(key: string): Promise<void> {
    try {
      const targetPath = this.resolveSafePath(key);
      await fs.promises.unlink(targetPath);
    } catch (error: unknown) {
      // Idempotent delete (bỏ qua nếu file không tồn tại)
      this.logger.warn(
        `Failed or ignored error when deleting key: ${key} - ${String(error)}`,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const targetPath = this.resolveSafePath(key);
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
