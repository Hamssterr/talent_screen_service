import type { Readable } from 'stream';
import {
  PdfExtractionError,
  PdfExtractionErrorCode,
} from './pdf-extraction.error';

/**
 * Đọc Node.js stream vào Buffer có giới hạn byte tối đa nhằm bảo vệ RAM hệ thống.
 * Tự động hủy stream và giải phóng listeners nếu vượt quá giới hạn hoặc stream lỗi.
 */
export async function readStreamWithLimit(
  stream: Readable,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let isFinished = false;

    const cleanup = () => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };

    const onData = (chunk: Buffer | string) => {
      if (isFinished) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;

      if (totalBytes > maxBytes) {
        isFinished = true;
        cleanup();
        stream.destroy();
        reject(
          new PdfExtractionError(
            PdfExtractionErrorCode.STREAM_LIMIT_EXCEEDED,
            `PDF stream size exceeded maximum limit of ${maxBytes} bytes`,
            { maxBytes, currentBytes: totalBytes },
          ),
        );
        return;
      }

      chunks.push(buf);
    };

    const onEnd = () => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      resolve(Buffer.concat(chunks, totalBytes));
    };

    const onError = (err: Error) => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      reject(err);
    };

    const onClose = () => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      resolve(Buffer.concat(chunks, totalBytes));
    };

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
    stream.on('close', onClose);
  });
}
