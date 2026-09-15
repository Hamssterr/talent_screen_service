import {
  Body,
  Controller,
  Get,
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
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  InterviewsService,
  CreateInterviewResult,
} from '../services/interviews.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CreateInterviewDto } from '../dto/create-interview.dto';
import { ListInterviewsQueryDto } from '../dto/list-interviews-query.dto';
import { RevokeInterviewDto } from '../dto/revoke-interview.dto';
import { ResendInvitationDto } from '../dto/resend-invitation.dto';
import {
  InterviewDetailDto,
  InterviewSummaryDto,
} from '../dto/interview-response.dto';
import { NotificationResponseDto } from '../../notifications/dto/notification-response.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../admin/permissions/guards/permissions.guard';
import { RequireAnyPermission } from '../../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../../admin/permissions/permissions.constants';
import { CurrentActor } from '../../../common/context/actor-context';
import type { ActorContext } from '../../../common/context/actor-context';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import {
  PaginatedResult,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto';
import { Headers } from '@nestjs/common';

@ApiTags('Interviews & Invitations')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class InterviewsController {
  constructor(
    private readonly interviewsService: InterviewsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('applications/:applicationId/interviews')
  @RequireAnyPermission(
    Permissions.InterviewsCreate,
    Permissions.InterviewsManage,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo buổi phỏng vấn (Interview) và gửi email mời cho ứng viên',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Khóa chống trùng lặp request bắt buộc',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Đã tạo lời mời phỏng vấn, email đang chờ gửi',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc thiếu Idempotency-Key',
  })
  @ApiResponse({
    status: 404,
    description: 'Hồ sơ ứng tuyển hoặc Question Set không tồn tại',
  })
  @ApiResponse({
    status: 409,
    description:
      'Application không ở trạng thái shortlisted, Job đã đóng, hoặc đã có phỏng vấn mở',
  })
  @ResponseMessage('Đã tạo lời mời phỏng vấn, email đang chờ gửi')
  async create(
    @CurrentActor() actor: ActorContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateInterviewDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CreateInterviewResult> {
    return this.interviewsService.create(
      actor,
      applicationId,
      dto,
      idempotencyKey,
    );
  }

  @Get('interviews')
  @RequireAnyPermission(
    Permissions.InterviewsRead,
    Permissions.InterviewsManage,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách phỏng vấn (Phân trang offset, lọc theo trạng thái, Job, hạn dùng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách phỏng vấn thành công',
  })
  @ResponseMessage('Lấy danh sách phỏng vấn thành công')
  async list(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListInterviewsQueryDto,
  ): Promise<PaginatedResult<InterviewSummaryDto>> {
    return this.interviewsService.list(actor, query);
  }

  @Get('interviews/:id')
  @RequireAnyPermission(
    Permissions.InterviewsRead,
    Permissions.InterviewsManage,
  )
  @ApiOperation({
    summary:
      'Lấy chi tiết phỏng vấn kèm snapshot câu hỏi và trạng thái thư mời',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy chi tiết phỏng vấn thành công',
  })
  @ApiResponse({ status: 404, description: 'Phỏng vấn không tồn tại' })
  @ResponseMessage('Lấy chi tiết phỏng vấn thành công')
  async findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InterviewDetailDto> {
    return this.interviewsService.findOne(actor, id);
  }

  @Post('interviews/:id/revoke')
  @RequireAnyPermission(
    Permissions.InterviewsRevoke,
    Permissions.InterviewsManage,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Thu hồi (revoke) lời mời phỏng vấn, đưa hồ sơ về trạng thái shortlisted',
  })
  @ApiResponse({
    status: 200,
    description: 'Thu hồi buổi phỏng vấn thành công',
  })
  @ApiResponse({ status: 404, description: 'Phỏng vấn không tồn tại' })
  @ApiResponse({
    status: 409,
    description:
      'Phỏng vấn không ở trạng thái invited hoặc xung đột phiên bản (OCC)',
  })
  @ResponseMessage('Thu hồi buổi phỏng vấn thành công')
  async revoke(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeInterviewDto,
  ): Promise<InterviewDetailDto> {
    return this.interviewsService.revoke(actor, id, dto);
  }

  @Post('interviews/:id/resend-invitation')
  @RequireAnyPermission(
    Permissions.InterviewsResend,
    Permissions.InterviewsManage,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi lại lời mời phỏng vấn mới và vô hiệu hóa link cũ',
  })
  @ApiResponse({
    status: 200,
    description: 'Gửi lại lời mời phỏng vấn thành công',
  })
  @ApiResponse({ status: 404, description: 'Phỏng vấn không tồn tại' })
  @ApiResponse({
    status: 409,
    description: 'Phỏng vấn đã hết hạn hoặc xung đột phiên bản (OCC)',
  })
  @ResponseMessage('Gửi lại lời mời phỏng vấn thành công')
  async resendInvitation(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResendInvitationDto,
  ): Promise<InterviewDetailDto> {
    return this.interviewsService.resendInvitation(actor, id, dto);
  }

  @Get('interviews/:id/notifications')
  @RequireAnyPermission(
    Permissions.InterviewsRead,
    Permissions.InterviewsManage,
  )
  @ApiOperation({
    summary:
      'Lấy danh sách lịch sử gửi email thông báo của một phỏng vấn (không kèm payload nhạy cảm)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách thông báo thành công',
  })
  @ResponseMessage('Lấy danh sách thông báo thành công')
  async listNotifications(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<NotificationResponseDto>> {
    return this.notificationsService.listByInterview(actor, id, query);
  }
}
