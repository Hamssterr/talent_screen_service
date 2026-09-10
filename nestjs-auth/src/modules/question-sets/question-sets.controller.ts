import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QuestionSetsService } from './question-sets.service';
import { CreateQuestionSetDto } from './dto/create-question-set.dto';
import { UpdateQuestionSetItemsDto } from './dto/update-question-set-items.dto';
import { ApproveQuestionSetDto } from './dto/approve-question-set.dto';
import { ListQuestionSetsQueryDto } from './dto/list-question-sets-query.dto';
import {
  QuestionSetDetailDto,
  QuestionSetSummaryDto,
} from './dto/question-set-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../admin/permissions/guards/permissions.guard';
import { RequirePermissions } from '../admin/permissions/decorators/permissions.decorator';
import { Permissions } from '../admin/permissions/permissions.constants';
import { CurrentActor } from '../../common/context/actor-context';
import type { ActorContext } from '../../common/context/actor-context';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { PaginatedResult } from '../../common/dto/pagination.dto';

@ApiTags('Question Sets')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class QuestionSetsController {
  constructor(private readonly questionSetsService: QuestionSetsService) {}

  @Post('applications/:applicationId/question-sets')
  @RequirePermissions(Permissions.QuestionSetsCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo Question Set thủ công (draft) cho hồ sơ ứng tuyển',
  })
  @ApiResponse({
    status: 201,
    description: 'Tạo Question Set draft thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'CV profile chưa sẵn sàng hoặc cvVersionId không khớp',
  })
  @ApiResponse({
    status: 404,
    description: 'Hồ sơ ứng tuyển hoặc CV không tồn tại',
  })
  @ApiResponse({
    status: 409,
    description:
      'Application không ở trạng thái shortlisted hoặc CV profile chưa approved',
  })
  @ResponseMessage('Tạo bộ câu hỏi draft thành công')
  async createManualDraft(
    @CurrentActor() actor: ActorContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateQuestionSetDto,
  ): Promise<QuestionSetDetailDto> {
    return this.questionSetsService.createManualDraft(
      actor,
      applicationId,
      dto,
    );
  }

  @Get('applications/:applicationId/question-sets')
  @RequirePermissions(Permissions.QuestionSetsRead)
  @ApiOperation({
    summary:
      'Danh sách Question Sets của một hồ sơ ứng tuyển (Phân trang offset)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách Question Sets thành công',
  })
  @ApiResponse({ status: 404, description: 'Hồ sơ ứng tuyển không tồn tại' })
  @ResponseMessage('Lấy danh sách bộ câu hỏi thành công')
  async listByApplication(
    @CurrentActor() actor: ActorContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Query() query: ListQuestionSetsQueryDto,
  ): Promise<PaginatedResult<QuestionSetSummaryDto>> {
    return this.questionSetsService.listByApplication(
      actor,
      applicationId,
      query,
    );
  }

  @Get('question-sets/:id')
  @RequirePermissions(Permissions.QuestionSetsRead)
  @ApiOperation({
    summary: 'Chi tiết Question Set kèm danh sách câu hỏi sắp xếp theo vị trí',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy chi tiết Question Set thành công',
  })
  @ApiResponse({ status: 404, description: 'Question Set không tồn tại' })
  @ResponseMessage('Lấy chi tiết bộ câu hỏi thành công')
  async findOne(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuestionSetDetailDto> {
    return this.questionSetsService.findOne(actor, id);
  }

  @Put('question-sets/:id/items')
  @RequirePermissions(Permissions.QuestionSetsUpdate)
  @ApiOperation({
    summary:
      'Thay thế toàn bộ câu hỏi của Question Set (Atomic Replace / Reorder)',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật câu hỏi thành công' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu câu hỏi không hợp lệ (số lượng, vị trí, criteria)',
  })
  @ApiResponse({ status: 404, description: 'Question Set không tồn tại' })
  @ApiResponse({
    status: 409,
    description: 'Question Set đã duyệt hoặc xung đột phiên bản (OCC)',
  })
  @ResponseMessage('Cập nhật danh sách câu hỏi thành công')
  async updateItems(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionSetItemsDto,
  ): Promise<QuestionSetDetailDto> {
    return this.questionSetsService.updateItems(actor, id, dto);
  }

  @Post('question-sets/:id/approve')
  @RequirePermissions(Permissions.QuestionSetsApprove)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phê duyệt Question Set (khóa bất biến, kiểm tra stale)',
  })
  @ApiResponse({
    status: 200,
    description: 'Phê duyệt Question Set thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Question Set rỗng hoặc thứ tự câu hỏi không hợp lệ',
  })
  @ApiResponse({ status: 404, description: 'Question Set không tồn tại' })
  @ApiResponse({
    status: 409,
    description:
      'Question Set đã duyệt, không ở trạng thái draft, bị stale hoặc xung đột phiên bản',
  })
  @ResponseMessage('Phê duyệt bộ câu hỏi thành công')
  async approve(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveQuestionSetDto,
  ): Promise<QuestionSetDetailDto> {
    return this.questionSetsService.approve(actor, id, dto);
  }

  @Post('question-sets/:id/clone')
  @RequirePermissions(Permissions.QuestionSetsCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Nhân bản (clone) Question Set thành một draft mới độc lập',
  })
  @ApiResponse({ status: 201, description: 'Clone Question Set thành công' })
  @ApiResponse({ status: 404, description: 'Question Set nguồn không tồn tại' })
  @ResponseMessage('Nhân bản bộ câu hỏi thành công')
  async clone(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuestionSetDetailDto> {
    return this.questionSetsService.clone(actor, id);
  }

  @Delete('question-sets/:id')
  @RequirePermissions(Permissions.QuestionSetsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Xóa mềm Question Set (Chỉ dành cho Admin có quyền question-sets:manage)',
  })
  @ApiResponse({ status: 204, description: 'Xóa mềm Question Set thành công' })
  @ApiResponse({ status: 404, description: 'Question Set không tồn tại' })
  async remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.questionSetsService.remove(actor, id);
  }
}
