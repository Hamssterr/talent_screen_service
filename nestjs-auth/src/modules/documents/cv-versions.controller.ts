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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CvVersionsService } from './cv-versions.service';
import {
  CvVersionDetailDto,
  CvVersionSafeDto,
} from './dto/cv-version-response.dto';
import { ListCvVersionsQueryDto } from './dto/list-cv-versions-query.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';
import { ApproveCvProfileDto } from './dto/approve-cv-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { SkipTransformResponse } from '../../common/decorators/skip-transform-response.decorator';

@ApiTags('Documents & CV Versions')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CvVersionsController {
  constructor(private readonly cvVersionsService: CvVersionsService) {}

  @Post('applications/:applicationId/cv-versions')
  @RequirePermissions(Permissions.CvUpload)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file CV mới cho hồ sơ ứng tuyển (PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Khóa idempotency đảm bảo không tạo lặp phiên bản CV',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File CV dạng PDF (tối đa 10MB)',
        },
      },
    },
  })
  @ResponseMessage('Upload CV thành công')
  @ApiResponse({
    status: 201,
    description: 'Upload CV thành công',
    type: CvVersionSafeDto,
  })
  @ApiResponse({
    status: 400,
    description: 'File không hợp lệ hoặc thiếu Idempotency-Key',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:upload' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ ứng tuyển' })
  @ApiResponse({
    status: 409,
    description: 'Xung đột trạng thái hoặc Idempotency',
  })
  upload(
    @CurrentActor() actor: ActorContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CvVersionSafeDto> {
    return this.cvVersionsService.upload(
      actor,
      applicationId,
      file,
      idempotencyKey,
    );
  }

  @Get('applications/:applicationId/cv-versions')
  @RequirePermissions(Permissions.CvRead)
  @ApiOperation({
    summary:
      'Lấy danh sách các phiên bản CV của hồ sơ ứng tuyển (offset-based)',
  })
  @ResponseMessage('Lấy danh sách CV versions thành công')
  @ApiResponse({
    status: 200,
    description: 'Danh sách CV versions và metadata phân trang',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:read' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ ứng tuyển' })
  findAll(
    @CurrentActor() actor: ActorContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Query() query: ListCvVersionsQueryDto,
  ) {
    return this.cvVersionsService.findAll(actor, applicationId, query);
  }

  @Get('cv-versions/:id')
  @RequirePermissions(Permissions.CvRead)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một phiên bản CV' })
  @ResponseMessage('Lấy thông tin CV version thành công')
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết CV version',
    type: CvVersionDetailDto,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:read' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy CV version' })
  findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CvVersionDetailDto> {
    return this.cvVersionsService.findOne(actor, id);
  }

  @Get('cv-versions/:id/download')
  @RequirePermissions(Permissions.CvDownload)
  @SkipTransformResponse()
  @ApiOperation({ summary: 'Tải file PDF của phiên bản CV (binary stream)' })
  @ApiResponse({ status: 200, description: 'Binary PDF Stream' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:download' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy file CV' })
  async download(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, filename, sizeBytes } =
      await this.cvVersionsService.download(actor, id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
      ...(sizeBytes > 0 ? { 'Content-Length': sizeBytes } : {}),
    });

    stream.pipe(res);
  }

  @Patch('cv-versions/:id/profile')
  @RequirePermissions(Permissions.CvUpdateProfile)
  @ApiOperation({
    summary: 'Cập nhật thủ công profile cho phiên bản CV (profile.v1)',
  })
  @ResponseMessage('Cập nhật profile thành công')
  @ApiResponse({
    status: 200,
    description: 'Cập nhật profile thành công',
    type: CvVersionDetailDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu profile không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:update-profile' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy CV version' })
  @ApiResponse({
    status: 409,
    description: 'Xung đột phiên bản (VERSION_CONFLICT) hoặc profile đã khóa',
  })
  updateProfile(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCvProfileDto,
  ): Promise<CvVersionDetailDto> {
    return this.cvVersionsService.updateProfile(actor, id, dto);
  }

  @Post('cv-versions/:id/approve-profile')
  @RequirePermissions(Permissions.CvApproveProfile)
  @ApiOperation({
    summary: 'Phê duyệt profile của phiên bản CV (immutable sau khi duyệt)',
  })
  @ResponseMessage('Phê duyệt profile thành công')
  @ApiResponse({
    status: 200,
    description: 'Phê duyệt profile thành công',
    type: CvVersionDetailDto,
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền cv:approve-profile',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy CV version' })
  @ApiResponse({
    status: 409,
    description: 'Profile chưa sẵn sàng hoặc đã duyệt trước đó',
  })
  approveProfile(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCvProfileDto,
  ): Promise<CvVersionDetailDto> {
    return this.cvVersionsService.approveProfile(actor, id, dto);
  }

  @Delete('cv-versions/:id')
  @RequirePermissions(Permissions.CvManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mềm phiên bản CV (chỉ Admin cv:manage)' })
  @ApiResponse({ status: 204, description: 'Xóa mềm CV version thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền cv:manage' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy CV version' })
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.cvVersionsService.remove(actor, id);
  }
}
