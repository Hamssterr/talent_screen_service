import { ApplicationStatus } from '../enums/application-status.enum';

export class CandidateSummaryDto {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
}

export class JobSummaryDto {
  id: string;
  title: string;
  status: string;
  ownerId: string;
}

export class ApplicationOwnerDto {
  ownerId: string;
  name: string;
  role?: string[]; // hoặc roles?: string[] nếu 1 user có nhiều role
}

export class ApplicationResponseDto {
  id: string;
  owner?: ApplicationOwnerDto;
  candidateId: string;
  jobId: string;
  currentCvVersionId: string | null;
  status: ApplicationStatus;
  version: number;
  notes: string | null;
  withdrawReason: string | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  candidate?: CandidateSummaryDto;
  job?: JobSummaryDto;
}
