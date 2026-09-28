import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
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
import { EvaluationResponseDto } from './dto/evaluation-response.dto';
import { TranscriptResponseDto } from './dto/transcript-response.dto';

@ApiTags('Reviews & Evaluations')
@Controller('interviews/:id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly summaryService: InterviewSummaryService,
    private readonly evaluationsService: EvaluationsService,
    private readonly transcriptService: TranscriptProjectionService,
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
    required: false,
    description: 'Khóa idempotency UUID để chống gọi AI trùng lặp',
  })
  @ApiOkResponse({
    description: 'Tạo bản tóm tắt revision mới thành công',
    type: EvaluationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy buổi phỏng vấn' })
  @ApiConflictResponse({
    description: 'Buổi phỏng vấn chưa kết thúc hoặc chưa bắt đầu',
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

  @Get('evaluations')
  @RequirePermissions(Permissions.ReviewsRead)
  @ApiOperation({
    summary:
      'Lấy danh sách evaluations (AI summaries & HR reviews) của buổi phỏng vấn',
  })
  @ApiOkResponse({
    description: 'Danh sách evaluations',
    type: [EvaluationResponseDto],
  })
  async getEvaluations(
    @Param('id', ParseUUIDPipe) interviewId: string,
  ): Promise<EvaluationResponseDto[]> {
    return this.evaluationsService.getEvaluations(interviewId);
  }

  @Get('transcript')
  @RequirePermissions(Permissions.ReviewsRead)
  @ApiOperation({
    summary: 'Xem toàn bộ transcript câu hỏi và câu trả lời của buổi phỏng vấn',
  })
  @ApiOkResponse({
    description: 'Transcript phỏng vấn',
    type: TranscriptResponseDto,
  })
  async getTranscript(
    @Param('id', ParseUUIDPipe) interviewId: string,
  ): Promise<TranscriptResponseDto> {
    return this.transcriptService.getTranscript(interviewId);
  }
}
