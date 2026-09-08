import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { CloseJobDto } from './dto/close-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Jobs')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @RequirePermissions(Permissions.JobsCreate)
  @ApiOperation({ summary: 'Tạo mới vị trí tuyển dụng (Job)' })
  @ResponseMessage('Tạo Job mới thành công')
  @ApiResponse({
    status: 201,
    description: 'Tạo Job thành công',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:create' })
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateJobDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.create(actor, dto);
  }

  @Get()
  @RequirePermissions(Permissions.JobsRead)
  @ApiOperation({
    summary: 'Lấy danh sách vị trí tuyển dụng (phân trang offset-based)',
  })
  @ResponseMessage('Lấy danh sách Job thành công')
  @ApiResponse({
    status: 200,
    description: 'Danh sách Job và metadata phân trang',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:read' })
  findAll(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListJobsQueryDto,
  ) {
    return this.jobsService.findAll(actor, query);
  }

  @Get(':id')
  @RequirePermissions(Permissions.JobsRead)
  @ApiOperation({ summary: 'Lấy chi tiết một vị trí tuyển dụng theo ID' })
  @ResponseMessage('Lấy thông tin Job thành công')
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết Job',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:read' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy Job (hoặc không có quyền xem)',
  })
  findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobResponseDto> {
    return this.jobsService.findOne(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.JobsUpdate)
  @ApiOperation({ summary: 'Cập nhật vị trí tuyển dụng (cần expectedVersion)' })
  @ResponseMessage('Cập nhật Job thành công')
  @ApiResponse({
    status: 200,
    description: 'Cập nhật Job thành công',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc cố tình đóng Job qua PATCH',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:update' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy Job hoặc không phải owner',
  })
  @ApiResponse({
    status: 409,
    description: 'Xung đột phiên bản (VERSION_CONFLICT)',
  })
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.update(actor, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.JobsClose)
  @ApiOperation({ summary: 'Đóng vị trí tuyển dụng (cần expectedVersion)' })
  @ResponseMessage('Đóng Job thành công')
  @ApiResponse({
    status: 200,
    description: 'Đóng Job thành công',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Job đã ở trạng thái closed' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:close' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy Job hoặc không phải owner',
  })
  @ApiResponse({
    status: 409,
    description: 'Xung đột phiên bản (VERSION_CONFLICT)',
  })
  close(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseJobDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.close(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.JobsManage)
  @ApiOperation({
    summary:
      'Soft delete vị trí tuyển dụng (chỉ dành cho Admin có jobs:manage)',
  })
  @ApiResponse({ status: 200, description: 'Soft delete Job thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền jobs:manage' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy Job' })
  softDelete(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.jobsService.softDelete(actor, id);
  }
}
