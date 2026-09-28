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
import { CvVersionsService } from './services/cv-versions.service';
import { CvProfileAiService } from './services/cv-profile-ai.service';
import {
  CvVersionDetailDto,
  CvVersionSafeDto,
} from './dto/cv-version-response.dto';
import { ListCvVersionsQueryDto } from './dto/list-cv-versions-query.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';
import { ApproveCvProfileDto } from './dto/approve-cv-profile.dto';
import { ExtractCvProfileDto } from './dto/extract-cv-profile.dto';
import { RetryCvExtractionDto } from './dto/retry-cv-extraction.dto';
import { CvExtractionResponseDto } from './dto/cv-extraction-response.dto';
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
  constructor(
    private readonly cvVersionsService: CvVersionsService,
    private readonly cvProfileAiService: CvProfileAiService,
  ) {}

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

  @Post('cv-versions/:id/extract-profile')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.CvUpdateProfile)
  @ApiOperation({
    summary: 'Kích hoạt AI trích xuất thông tin hồ sơ từ tài liệu CV (PDF)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Khóa idempotency đảm bảo không kích hoạt lặp tác vụ trích xuất',
  })
  @ResponseMessage('Trích xuất profile từ CV thành công')
  @ApiResponse({
    status: 200,
    description: 'Trích xuất profile thành công (trả về profile draft)',
    type: CvExtractionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu đầu vào không hợp lệ hoặc thiếu Idempotency-Key',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền cv:update-profile',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên bản CV' })
  @ApiResponse({
    status: 409,
    description:
      'Xung đột phiên bản (VERSION_CONFLICT), hồ sơ đang xử lý (AI_PROCESSING_CONFLICT), hoặc profile đã duyệt (CV_PROFILE_ALREADY_APPROVED)',
  })
  @ApiResponse({
    status: 422,
    description:
      'File PDF không thể trích xuất (mã hóa CV_ENCRYPTED_PDF, bản scan CV_TEXT_UNAVAILABLE, hoặc vượt số trang CV_PAGE_LIMIT_EXCEEDED)',
  })
  @ApiResponse({
    status: 502,
    description:
      'Lỗi từ dịch vụ AI (AI_PROVIDER_UNAVAILABLE, AI_TIMEOUT, AI_INVALID_OUTPUT)',
  })
  extractProfile(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtractCvProfileDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CvExtractionResponseDto> {
    return this.cvProfileAiService.extractProfile(
      actor,
      id,
      dto,
      idempotencyKey,
    );
  }

  @Post('cv-versions/:id/retry-extraction')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.CvUpdateProfile)
  @ApiOperation({
    summary:
      'Thử lại việc trích xuất AI cho phiên bản CV thất bại hoặc quá hạn',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Khóa idempotency đảm bảo không retry lặp',
  })
  @ResponseMessage('Thử lại trích xuất profile CV thành công')
  @ApiResponse({
    status: 200,
    description: 'Thử lại trích xuất profile thành công',
    type: CvExtractionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu đầu vào không hợp lệ hoặc thiếu Idempotency-Key',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền cv:update-profile',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phiên bản CV' })
  @ApiResponse({
    status: 409,
    description:
      'Xung đột phiên bản hoặc trạng thái hiện tại không cho phép retry',
  })
  @ApiResponse({
    status: 422,
    description: 'File PDF không thể trích xuất',
  })
  @ApiResponse({
    status: 502,
    description: 'Lỗi từ dịch vụ AI',
  })
  retryExtraction(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryCvExtractionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CvExtractionResponseDto> {
    return this.cvProfileAiService.retryExtraction(
      actor,
      id,
      dto,
      idempotencyKey,
    );
  }
}
