import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { InterviewSummaryService } from './services/interview-summary.service';
import { EvaluationsService } from './services/evaluations.service';
import { TranscriptProjectionService } from './services/transcript-projection.service';
import { ReviewAccessPolicy } from './services/review-access.policy';
import { HrReviewService } from './services/hr-review.service';
import { EvaluationResponseDto } from './dto/evaluation-response.dto';
import { TranscriptResponseDto } from './dto/transcript-response.dto';
import { CreateHrReviewDto } from './dto/create-hr-review.dto';
import { EvaluationType } from './enums/evaluation-type.enum';

@ApiTags('Reviews & Evaluations')
@Controller('interviews/:id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly summaryService: InterviewSummaryService,
    private readonly evaluationsService: EvaluationsService,
    private readonly transcriptService: TranscriptProjectionService,
    private readonly reviewAccessPolicy: ReviewAccessPolicy,
    private readonly hrReviewService: HrReviewService,
  ) {}

  @Post('regenerate-summary')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.ReviewsCreate)
  @ApiOperation({
    summary:
      'Tạo revision tóm tắt mới (AI Summary) cho buổi phỏng vấn đã hoàn tất',
    description:
      'Chỉ áp dụng khi buổi phỏng vấn đã ở trạng thái terminal (completed/expired/cancelled). Quá trình chạy ngoài DB transaction và kiểm tra bằng chứng trước khi lưu.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Khóa idempotency UUID để chống gọi AI trùng lặp',
  })
  @ApiOkResponse({
    description: 'Tạo bản tóm tắt revision mới thành công',
    type: EvaluationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy buổi phỏng vấn' })
  @ApiConflictResponse({
    description:
      'Buổi phỏng vấn chưa kết thúc hoặc hồ sơ đã ở trạng thái terminal',
  })
  async regenerateSummary(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @CurrentActor() actor: ActorContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<EvaluationResponseDto> {
    return this.summaryService.regenerateSummary(
      interviewId,
      actor,
      idempotencyKey,
    );
  }

  @Post('hr-reviews')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permissions.ReviewsCreate)
  @ApiOperation({
    summary: 'Tạo đánh giá chính thức của HR (HR Review)',
    description:
      'Đánh giá chính thức của HR dựa trên transcript và AI summary. Yêu cầu interview session hoàn tất và application đang under_review.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Khóa idempotency UUID',
  })
  @ApiOkResponse({
    description: 'Tạo đánh giá HR thành công',
    type: EvaluationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy buổi phỏng vấn' })
  @ApiConflictResponse({
    description:
      'Buổi phỏng vấn chưa kết thúc hoặc hồ sơ không ở trạng thái under_review',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Bằng chứng lượt phỏng vấn không hợp lệ, hoặc tiêu chí đánh giá không tồn tại',
  })
  async createHrReview(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Body() dto: CreateHrReviewDto,
    @CurrentActor() actor: ActorContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<EvaluationResponseDto> {
    return this.hrReviewService.createHrReview(
      interviewId,
      dto,
      actor,
      idempotencyKey,
    );
  }

  @Get('evaluations')
  @RequirePermissions(Permissions.ReviewsRead)
  @ApiOperation({
    summary:
      'Lấy danh sách evaluations (AI summaries & HR reviews) của buổi phỏng vấn',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: EvaluationType,
    description: 'Lọc theo loại đánh giá: ai_summary hoặc hr_review',
  })
  @ApiOkResponse({
    description: 'Danh sách evaluations',
    type: [EvaluationResponseDto],
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy buổi phỏng vấn' })
  async getEvaluations(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @CurrentActor() actor: ActorContext,
    @Query('type') type?: EvaluationType,
  ): Promise<EvaluationResponseDto[]> {
    await this.reviewAccessPolicy.getAccessibleInterviewOrThrow(
      interviewId,
      actor,
    );
    return this.evaluationsService.getEvaluations(interviewId, type);
  }

  @Get('transcript')
  @RequirePermissions(Permissions.ReviewsRead)
  @ApiOperation({
    summary: 'Xem toàn bộ transcript câu hỏi và câu trả lời của buổi phỏng vấn',
  })
  @ApiOkResponse({
    description: 'Transcript phỏng vấn kèm coverage và snapshot',
    type: TranscriptResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy buổi phỏng vấn' })
  async getTranscript(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<TranscriptResponseDto> {
    const interview =
      await this.reviewAccessPolicy.getAccessibleInterviewOrThrow(
        interviewId,
        actor,
      );
    return this.transcriptService.getTranscript(interview);
  }
}
