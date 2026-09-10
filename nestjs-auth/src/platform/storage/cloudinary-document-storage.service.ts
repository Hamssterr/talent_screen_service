import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import * as https from 'https';
import * as http from 'http';
import { DocumentStorage, StoredDocument } from './document-storage.interface';

@Injectable()
export class CloudinaryDocumentStorageService implements DocumentStorage {
  private readonly logger = new Logger(CloudinaryDocumentStorageService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>(
      'storage.cloudinary.cloudName',
    );
    const apiKey = this.configService.get<string>('storage.cloudinary.apiKey');
    const apiSecret = this.configService.get<string>(
      'storage.cloudinary.apiSecret',
    );

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.logger.log(
        `Initialized CloudinaryDocumentStorage for cloud: ${cloudName}`,
      );
    }
  }

  async put(
    key: string,
    content: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StoredDocument> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: key,
          resource_type: 'raw',
          type: 'authenticated',
          overwrite: false,
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed for key ${key}: ${error?.message || 'unknown error'}`,
            );
            return reject(
              new Error(
                `Cloudinary upload failed: ${error?.message || 'Empty response'}`,
              ),
            );
          }

          const storedMetadata: Record<string, unknown> = {
            assetId: result.asset_id,
            resourceType: result.resource_type,
            deliveryType: result.type,
            providerVersion: result.version,
            ...(metadata || {}),
          };

          resolve({
            key,
            size: result.bytes,
            mimeType: (metadata?.mimeType as string) || 'application/pdf',
            createdAt: new Date(result.created_at || Date.now()),
            metadata: storedMetadata,
          });
        },
      );

      if (Buffer.isBuffer(content)) {
        uploadStream.end(content);
      } else {
        content.pipe(uploadStream);
      }
    });
  }

  async get(key: string): Promise<Readable> {
    // Tạo signed authenticated private URL ngắn hạn (hết hạn trong 300 giây)
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const signedUrl = cloudinary.utils.private_download_url(key, 'pdf', {
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: expiresAt,
    });

    return new Promise((resolve, reject) => {
      const client = signedUrl.startsWith('https') ? https : http;
      client
        .get(signedUrl, (response) => {
          if (
            response.statusCode &&
            (response.statusCode < 200 || response.statusCode >= 300)
          ) {
            this.logger.error(
              `Failed to download asset from Cloudinary. Status code: ${response.statusCode}`,
            );
            return reject(
              new Error(
                `Cloudinary download failed with status ${response.statusCode}`,
              ),
            );
          }
          resolve(response);
        })
        .on('error', (err) => {
          this.logger.error(
            `Error connecting to Cloudinary URL: ${err.message}`,
          );
          reject(err);
        });
    });
  }

  async delete(key: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key, {
        resource_type: 'raw',
        type: 'authenticated',
        invalidate: true,
      });
    } catch (error: unknown) {
      // Idempotent delete (chỉ log cảnh báo)
      this.logger.warn(
        `Failed or ignored error when deleting Cloudinary key ${key}: ${String(error)}`,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result: unknown = await cloudinary.api.resource(key, {
        resource_type: 'raw',
        type: 'authenticated',
      });
      return !!result;
    } catch {
      return false;
    }
  }
}
