import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequireAnyPermission } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post(':id/retry')
  @RequireAnyPermission(
    Permissions.InterviewsResend,
    Permissions.InterviewsManage,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Thử gửi lại email thông báo phỏng vấn khi bị lỗi (pending/failed/unknown)',
  })
  @ApiResponse({
    status: 200,
    description: 'Yêu cầu gửi lại notification thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Notification không trong trạng thái retryable hoặc payload đã hết hạn',
  })
  @ApiResponse({ status: 404, description: 'Notification không tồn tại' })
  @ResponseMessage('Yêu cầu gửi lại thông báo thành công')
  async retry(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.retry(actor, id);
  }
}
