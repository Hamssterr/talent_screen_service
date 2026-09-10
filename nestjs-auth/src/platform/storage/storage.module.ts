import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DOCUMENT_STORAGE_TOKEN } from './document-storage.interface';
import { LocalDocumentStorageService } from './local-document-storage.service';
import { CloudinaryDocumentStorageService } from './cloudinary-document-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalDocumentStorageService,
    CloudinaryDocumentStorageService,
    {
      provide: DOCUMENT_STORAGE_TOKEN,
      useFactory: (
        configService: ConfigService,
        localService: LocalDocumentStorageService,
        cloudinaryService: CloudinaryDocumentStorageService,
      ) => {
        const driver = configService.get<string>('storage.driver') || 'local';
        if (driver === 'cloudinary') {
          return cloudinaryService;
        }
        return localService;
      },
      inject: [
        ConfigService,
        LocalDocumentStorageService,
        CloudinaryDocumentStorageService,
      ],
    },
  ],
  exports: [DOCUMENT_STORAGE_TOKEN],
})
export class StorageModule {}
