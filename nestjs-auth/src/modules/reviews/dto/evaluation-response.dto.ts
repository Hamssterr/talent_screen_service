import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationType } from '../enums/evaluation-type.enum';

export class EvaluationResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  interviewId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  sessionId: string;

  @ApiProperty({ enum: EvaluationType, example: EvaluationType.AI_SUMMARY })
  type: EvaluationType;

  @ApiProperty({ example: 1 })
  revision: number;

  @ApiProperty({ example: 1 })
  schemaVersion: number;

  @ApiProperty({ description: 'Nội dung phân tích/đánh giá JSON' })
  content: Record<string, any>;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  aiRunId?: string | null;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  inputHash?: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  createdBy?: string | null;

  @ApiProperty({ example: '2026-09-20T12:00:00.000Z' })
  createdAt: Date;
}
