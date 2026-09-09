import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { WithdrawApplicationDto } from './dto/withdraw-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@ApiTags('Applications')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @RequirePermissions(Permissions.ApplicationsCreate)
  @ApiOperation({
    summary: 'Nộp hồ sơ ứng tuyển (Application) với Idempotency',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Khóa idempotency đảm bảo không tạo lặp request',
  })
  @ResponseMessage('Nộp hồ sơ ứng tuyển thành công')
  @ApiResponse({
    status: 201,
    description: 'Tạo hồ sơ ứng tuyển thành công',
    type: ApplicationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Thiếu Idempotency-Key hoặc dữ liệu không hợp lệ',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền applications:create',
  })
  @ApiResponse({
    status: 404,
    description: 'Ứng viên hoặc vị trí tuyển dụng không tìm thấy',
  })
  @ApiResponse({
    status: 409,
    description:
      'Hồ sơ đã tồn tại hoặc Job không nhận hồ sơ hoặc xung đột Idempotency',
  })
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateApplicationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.create(actor, dto, idempotencyKey);
  }

  @Get()
  @RequirePermissions(Permissions.ApplicationsRead)
  @ApiOperation({
    summary:
      'Lấy danh sách hồ sơ ứng tuyển (phân trang offset-based, scope visibility)',
  })
  @ResponseMessage('Lấy danh sách hồ sơ thành công')
  @ApiResponse({
    status: 200,
    description: 'Danh sách hồ sơ ứng tuyển và metadata phân trang',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền applications:read' })
  findAll(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.applicationsService.findAll(actor, query);
  }

  @Get(':id')
  @RequirePermissions(Permissions.ApplicationsRead)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết hồ sơ ứng tuyển theo ID' })
  @ResponseMessage('Lấy thông tin hồ sơ thành công')
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết hồ sơ ứng tuyển',
    type: ApplicationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền truy cập hồ sơ này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ' })
  findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.findOne(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ApplicationsUpdate)
  @ApiOperation({ summary: 'Cập nhật ghi chú hồ sơ ứng tuyển (OCC)' })
  @ResponseMessage('Cập nhật hồ sơ ứng tuyển thành công')
  @ApiResponse({
    status: 200,
    description: 'Cập nhật ghi chú hồ sơ thành công',
    type: ApplicationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền cập nhật hồ sơ này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ' })
  @ApiResponse({
    status: 409,
    description: 'Xung đột phiên bản (VERSION_CONFLICT)',
  })
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.update(actor, id, dto);
  }

  @Post(':id/withdraw')
  @RequirePermissions(Permissions.ApplicationsWithdraw)
  @ApiOperation({ summary: 'Rút hồ sơ ứng tuyển (Withdraw)' })
  @ResponseMessage('Rút hồ sơ ứng tuyển thành công')
  @ApiResponse({
    status: 200,
    description: 'Rút hồ sơ thành công',
    type: ApplicationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền rút hồ sơ này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ' })
  @ApiResponse({
    status: 409,
    description:
      'Xung đột trạng thái (APPLICATION_STATE_CONFLICT) hoặc version',
  })
  withdraw(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithdrawApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.withdraw(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.ApplicationsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Xóa hồ sơ ứng tuyển (soft delete - chỉ Admin applications:manage)',
  })
  @ApiResponse({ status: 204, description: 'Xóa hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền applications:manage',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ' })
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.applicationsService.remove(actor, id);
  }
}
