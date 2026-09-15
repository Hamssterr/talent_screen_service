import { ApiProperty } from '@nestjs/swagger';
import { InterviewStatus } from '../enums/interview-status.enum';
import { InterviewLanguage } from '../enums/interview-language.enum';
import { QuestionSource } from '../../question-sets/enums/question-source.enum';
import { QuestionDifficulty } from '../../question-sets/enums/question-difficulty.enum';

export class InterviewQuestionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  sourceQuestionId: string | null;

  @ApiProperty()
  position: number;

  @ApiProperty()
  text: string;

  @ApiProperty({ enum: QuestionSource })
  source: QuestionSource;

  @ApiProperty({ nullable: true })
  competency: string | null;

  @ApiProperty({ nullable: true })
  evaluationCriterionId: string | null;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  @ApiProperty()
  allowFollowUp: boolean;

  @ApiProperty()
  maxFollowUps: number;

  @ApiProperty({ nullable: true })
  evidenceRefs: unknown[] | null;
}

export class InterviewSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  applicationId: string;

  @ApiProperty()
  questionSetId: string;

  @ApiProperty()
  cvVersionId: string;

  @ApiProperty()
  roundNo: number;

  @ApiProperty({ enum: InterviewStatus })
  status: InterviewStatus;

  @ApiProperty()
  invitationExpiresAt: Date;

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty()
  version: number;

  @ApiProperty()
  invitationVersion: number;

  @ApiProperty({ enum: InterviewLanguage })
  language: InterviewLanguage;

  @ApiProperty()
  maxFollowUpsTotal: number;

  @ApiProperty({ nullable: true })
  cancelReason: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ nullable: true })
  completedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class InterviewDetailDto extends InterviewSummaryDto {
  @ApiProperty()
  profileSnapshot: Record<string, unknown>;

  @ApiProperty()
  jobSnapshot: Record<string, unknown>;

  @ApiProperty({ type: () => [InterviewQuestionResponseDto] })
  questions: InterviewQuestionResponseDto[];

  @ApiProperty({ required: false })
  candidateName?: string;

  @ApiProperty({ required: false })
  candidateEmail?: string;

  @ApiProperty({ required: false })
  jobTitle?: string;
}

export class CandidateLobbyDto {
  @ApiProperty()
  interviewId: string;

  @ApiProperty()
  candidateName: string;

  @ApiProperty()
  jobTitle: string;

  @ApiProperty({ enum: InterviewStatus })
  status: InterviewStatus;

  @ApiProperty({ enum: InterviewLanguage })
  language: InterviewLanguage;

  @ApiProperty()
  invitationExpiresAt: Date;

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty()
  totalQuestions: number;

  @ApiProperty({ type: [String] })
  instructions: string[];

  @ApiProperty()
  canStart: boolean;

  @ApiProperty()
  serverNow: Date;

  @ApiProperty({ required: false })
  consentVersion?: string;

  @ApiProperty({ required: false })
  consentText?: string;
}
