import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TranscriptTurnAnswerDto {
  @ApiPropertyOptional({ example: 'Tôi đã có kinh nghiệm sử dụng Docker...' })
  text: string | null;

  @ApiProperty({ example: false })
  isSkipped: boolean;

  @ApiProperty({ example: '2026-09-20T12:05:00.000Z' })
  submittedAt: Date;
}

export class TranscriptTurnDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  turnId: string;

  @ApiProperty({ example: 1 })
  sequenceNo: number;

  @ApiProperty({ example: 'main' })
  kind: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  rootQuestionId: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  parentTurnId?: string | null;

  @ApiProperty({
    example: 'Hãy trình bày hiểu biết của bạn về NestJS lifecycle.',
  })
  questionText: string;

  @ApiPropertyOptional({ example: 'NestJS Framework' })
  competency?: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  evaluationCriterionId?: string | null;

  @ApiProperty({ example: 'answered' })
  status: string;

  @ApiProperty({ example: '2026-09-20T12:01:00.000Z' })
  presentedAt: Date;

  @ApiPropertyOptional({ example: '2026-09-20T12:05:00.000Z' })
  closedAt?: Date | null;

  @ApiPropertyOptional({ type: TranscriptTurnAnswerDto })
  answer?: TranscriptTurnAnswerDto | null;
}

export class TranscriptCoverageDto {
  @ApiProperty({ example: 5 })
  mainTotal: number;

  @ApiProperty({ example: 4 })
  mainAnswered: number;

  @ApiProperty({ example: 1 })
  mainSkipped: number;

  @ApiProperty({ example: 0 })
  mainUnanswered: number;

  @ApiProperty({ example: 3 })
  followUpsTotal: number;

  @ApiProperty({ example: 2 })
  followUpsAnswered: number;

  @ApiProperty({ example: 1 })
  followUpsSkipped: number;
}

export class TranscriptResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  interviewId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  applicationId: string;

  @ApiProperty({ example: 1 })
  roundNo: number;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  cvVersionId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-25T12:00:00.000Z' })
  deadlineAt?: Date | null;

  @ApiPropertyOptional({ example: { title: 'Backend Engineer' } })
  jobSnapshot?: Record<string, any> | null;

  @ApiPropertyOptional({ example: { fullName: 'Nguyen Van A' } })
  profileSnapshot?: Record<string, any> | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  sessionId?: string | null;

  @ApiPropertyOptional({ example: 'completed' })
  sessionStatus?: string | null;

  @ApiPropertyOptional({ example: 'all_questions_answered' })
  endReason?: string | null;

  @ApiPropertyOptional({ example: '2026-09-20T12:00:00.000Z' })
  startedAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-20T12:20:00.000Z' })
  endedAt?: Date | null;

  @ApiProperty({ type: TranscriptCoverageDto })
  coverage: TranscriptCoverageDto;

  @ApiProperty({ type: [TranscriptTurnDto] })
  turns: TranscriptTurnDto[];
}
