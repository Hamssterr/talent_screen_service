import { ExtractedPage } from '../../../documents/extraction/document-text-extractor.interface';
import { CvProfileV1Dto } from '../../../documents/schemas/cv-profile-v1.schema';

export interface ProfileExtractionInput {
  cvVersionId: string;
  pages: ExtractedPage[];
  language?: string;
}

export interface ProfileEvidenceValidationResult {
  isValid: boolean;
  reason?: string;
  invalidEvidence?: {
    field: string;
    page?: number;
    quote?: string;
  };
}

export type ProfileExtractionOutput = CvProfileV1Dto;
