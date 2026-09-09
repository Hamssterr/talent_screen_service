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
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { ListCandidatesQueryDto } from './dto/list-candidates-query.dto';
import { CandidateResponseDto } from './dto/candidate-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@ApiTags('Candidates')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  @RequirePermissions(Permissions.CandidatesCreate)
  @ApiOperation({ summary: 'Tạo mới ứng viên (Candidate)' })
  @ResponseMessage('Tạo ứng viên mới thành công')
  @ApiResponse({
    status: 201,
    description: 'Tạo ứng viên thành công',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền candidates:create' })
  @ApiResponse({
    status: 409,
    description: 'Ứng viên đã tồn tại với email này (CANDIDATE_ALREADY_EXISTS)',
  })
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateCandidateDto,
  ): Promise<CandidateResponseDto> {
    return this.candidatesService.create(actor, dto);
  }

  @Get()
  @RequirePermissions(Permissions.CandidatesRead)
  @ApiOperation({
    summary: 'Lấy danh sách ứng viên (phân trang offset-based)',
  })
  @ResponseMessage('Lấy danh sách ứng viên thành công')
  @ApiResponse({
    status: 200,
    description: 'Danh sách ứng viên và metadata phân trang',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền candidates:read' })
  findAll(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListCandidatesQueryDto,
  ) {
    return this.candidatesService.findAll(actor, query);
  }

  @Get(':id')
  @RequirePermissions(Permissions.CandidatesRead)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết ứng viên theo ID' })
  @ResponseMessage('Lấy thông tin ứng viên thành công')
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết ứng viên',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền truy cập ứng viên này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ứng viên' })
  findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CandidateResponseDto> {
    return this.candidatesService.findOne(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CandidatesUpdate)
  @ApiOperation({ summary: 'Cập nhật thông tin ứng viên' })
  @ResponseMessage('Cập nhật ứng viên thành công')
  @ApiResponse({
    status: 200,
    description: 'Cập nhật ứng viên thành công',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền candidates:update hoặc không sở hữu ứng viên',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ứng viên' })
  @ApiResponse({
    status: 409,
    description: 'Email trùng lặp (CANDIDATE_ALREADY_EXISTS)',
  })
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ): Promise<CandidateResponseDto> {
    return this.candidatesService.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CandidatesManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa ứng viên (soft delete - chỉ Admin candidates:manage)',
  })
  @ApiResponse({ status: 204, description: 'Xóa ứng viên thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền candidates:manage' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ứng viên' })
  @ApiResponse({
    status: 409,
    description:
      'Không thể xóa vì còn application hoạt động (CANDIDATE_HAS_APPLICATIONS)',
  })
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.candidatesService.remove(actor, id);
  }
}
