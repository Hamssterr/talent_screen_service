import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  CandidateAccessService,
  CANDIDATE_COOKIE_NAME,
} from '../services/candidate-access.service';
import { InvitationExchangeDto } from '../dto/invitation-exchange.dto';
import { CandidateLobbyDto } from '../dto/interview-response.dto';
import { CandidateInterviewAccessGuard } from '../guards/candidate-interview-access.guard';
import { CurrentInterviewAccessCookie } from '../decorators/current-interview-access.decorator';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';

@ApiTags('Candidate Interview Access')
@Controller('candidate')
export class CandidateInterviewAccessController {
  constructor(
    private readonly candidateAccessService: CandidateAccessService,
    private readonly configService: ConfigService,
  ) {}

  @Post('invitation-exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Candidate đổi invitation token từ email lấy HttpOnly cookie truy cập',
  })
  @ApiResponse({
    status: 200,
    description: 'Đổi token thành công, cookie đã được thiết lập',
  })
  @ApiResponse({
    status: 401,
    description: 'Lời mời phỏng vấn không hợp lệ, đã hết hạn hoặc bị thu hồi',
  })
  @ResponseMessage('Xác thực lời mời phỏng vấn thành công')
  async exchange(
    @Body() dto: InvitationExchangeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ interviewId: string }> {
    const { interviewId, rawCookieToken, cookieExpiresAt } =
      await this.candidateAccessService.exchangeToken(dto.token);

    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    // Set HttpOnly cookie cho Candidate
    response.cookie(CANDIDATE_COOKIE_NAME, rawCookieToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/v1/candidate',
      expires: cookieExpiresAt,
    });

    return { interviewId };
  }

  @Get('interview')
  @UseGuards(CandidateInterviewAccessGuard)
  @ApiCookieAuth('interview_access')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Candidate xem phòng chờ phỏng vấn (Lobby chỉ đọc trước khi bắt đầu làm bài)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin phỏng vấn thành công',
  })
  @ApiResponse({
    status: 401,
    description: 'Phiên truy cập không hợp lệ hoặc đã hết hạn',
  })
  @ResponseMessage('Lấy thông tin phỏng vấn thành công')
  async getLobby(
    @CurrentInterviewAccessCookie() cookieToken: string,
  ): Promise<CandidateLobbyDto> {
    return this.candidateAccessService.getLobby(cookieToken);
  }
}
