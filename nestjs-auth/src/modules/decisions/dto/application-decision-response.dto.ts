import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DecisionOutcome } from '../enums/decision-outcome.enum';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';

export class ApplicationDecisionResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  applicationId: string;

  @ApiProperty({
    enum: DecisionOutcome,
    example: DecisionOutcome.APPROVED,
  })
  outcome: DecisionOutcome;

  @ApiProperty({
    example:
      'Ứng viên đáp ứng đầy đủ tiêu chí kỹ thuật, giao tiếp tốt và có kinh nghiệm thực tế phù hợp.',
  })
  internalReason: string;

  @ApiPropertyOptional({
    example: 'Chúc mừng bạn đã vượt qua vòng phỏng vấn kỹ thuật của chúng tôi!',
  })
  candidateMessage: string | null;

  @ApiProperty({ example: true })
  notifyCandidate: boolean;

  @ApiProperty({
    enum: ApplicationStatus,
    example: ApplicationStatus.UNDER_REVIEW,
  })
  previousStatus: ApplicationStatus;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  basisInterviewId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  basisSessionId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  basisHrReviewId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  decidedBy: string;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;
}
