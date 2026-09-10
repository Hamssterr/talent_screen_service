import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionSetStatus } from '../enums/question-set-status.enum';
import { QuestionSetMode } from '../enums/question-set-mode.enum';
import { QuestionLanguage } from '../enums/question-language.enum';
import { QuestionSource } from '../enums/question-source.enum';
import { QuestionDifficulty } from '../enums/question-difficulty.enum';

export class QuestionSetItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  position: number;

  @ApiProperty()
  text: string;

  @ApiProperty({ enum: QuestionSource })
  source: QuestionSource;

  @ApiPropertyOptional()
  competency: string | null;

  @ApiPropertyOptional()
  evaluationCriterionId: string | null;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  @ApiProperty()
  allowFollowUp: boolean;

  @ApiProperty()
  maxFollowUps: number;

  @ApiPropertyOptional()
  evidenceRefs: unknown[] | null;

  @ApiPropertyOptional()
  reviewNotes: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class QuestionSetSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  applicationId: string;

  @ApiProperty()
  cvVersionId: string;

  @ApiProperty()
  cvProfileVersion: number;

  @ApiProperty()
  jobVersion: number;

  @ApiProperty({ enum: QuestionLanguage })
  language: QuestionLanguage;

  @ApiProperty({ enum: QuestionSetMode })
  mode: QuestionSetMode;

  @ApiProperty({ enum: QuestionSetStatus })
  status: QuestionSetStatus;

  @ApiProperty()
  version: number;

  @ApiProperty()
  generationVersion: number;

  @ApiPropertyOptional()
  aiRunId: string | null;

  @ApiPropertyOptional()
  sourceQuestionSetId: string | null;

  @ApiPropertyOptional()
  approvedBy: string | null;

  @ApiPropertyOptional()
  approvedAt: Date | null;

  @ApiProperty()
  itemCount: number;

  @ApiPropertyOptional()
  isStale?: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class QuestionSetDetailDto extends QuestionSetSummaryDto {
  @ApiProperty()
  profileSnapshot: Record<string, unknown>;

  @ApiProperty()
  jobSnapshot: Record<string, unknown>;

  @ApiProperty({ type: [QuestionSetItemResponseDto] })
  items: QuestionSetItemResponseDto[];
}
