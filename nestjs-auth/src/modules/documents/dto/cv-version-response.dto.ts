import { CvExtractionStatus } from '../enums/cv-extraction-status.enum';
import { CvProfileStatus } from '../enums/cv-profile-status.enum';
import { CvProfileV1Dto } from '../schemas/cv-profile-v1.schema';

export class CvVersionSafeDto {
  id: string;
  applicationId: string;
  version: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  extractionStatus: CvExtractionStatus;
  profileStatus: CvProfileStatus;
  profileVersion: number;
  createdAt: Date;
}

export class CvVersionDetailDto extends CvVersionSafeDto {
  ownerId: string;
  pageCount: number | null;
  processingVersion: number;
  profileJson: CvProfileV1Dto | null;
  profileApprovedBy: string | null;
  profileApprovedAt: Date | null;
  errorCode: string | null;
  updatedAt: Date;
}
