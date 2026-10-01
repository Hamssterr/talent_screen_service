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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { DecisionsService } from './decisions.service';
import { CreateApplicationDecisionDto } from './dto/create-application-decision.dto';
import { ApplicationDecisionResponseDto } from './dto/application-decision-response.dto';

@ApiTags('Decisions')
@Controller('applications/:id/decisions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DecisionsController {
  constructor(private readonly decisionsService: DecisionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permissions.DecisionsCreate)
  @ApiOperation({
    summary:
      'Tạo quyết định chính thức cho hồ sơ ứng tuyển (Approved / Rejected)',
    description:
      'Chỉ áp dụng khi hồ sơ đang ở trạng thái under_review và dựa trên căn cứ HR Review revision mới nhất. Chuyển hồ sơ sang trạng thái terminal.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Khóa idempotency UUID để bảo đảm an toàn khi submit quyết định',
  })
  @ApiOkResponse({
    description: 'Quyết định được tạo thành công',
    type: ApplicationDecisionResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy hồ sơ ứng tuyển (Resource Hiding)',
  })
  @ApiConflictResponse({
    description:
      'Hồ sơ đã kết thúc, đã có quyết định, chưa under_review hoặc bản HR Review không phải revision mới nhất',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Căn cứ buổi phỏng vấn, session hoặc bản đánh giá HR không hợp lệ',
  })
  async createDecision(
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateApplicationDecisionDto,
    @CurrentActor() actor: ActorContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApplicationDecisionResponseDto> {
    return this.decisionsService.createDecision(
      applicationId,
      dto,
      actor,
      idempotencyKey,
    );
  }

  @Get()
  @RequirePermissions(Permissions.DecisionsRead)
  @ApiOperation({
    summary: 'Xem quyết định chính thức của hồ sơ ứng tuyển',
  })
  @ApiOkResponse({
    description: 'Thông tin quyết định chính thức',
    type: ApplicationDecisionResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'Không tìm thấy hồ sơ hoặc hồ sơ chưa có quyết định chính thức',
  })
  async getDecision(
    @Param('id', ParseUUIDPipe) applicationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ApplicationDecisionResponseDto> {
    return this.decisionsService.getDecision(applicationId, actor);
  }
}
