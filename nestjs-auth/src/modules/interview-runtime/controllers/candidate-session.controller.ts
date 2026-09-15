import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CandidateInterviewAccessGuard } from '../../interviews/guards/candidate-interview-access.guard';
import { CurrentInterviewAccessCookie } from '../../interviews/decorators/current-interview-access.decorator';
import { CANDIDATE_COOKIE_NAME } from '../../interviews/services/candidate-access.service';
import { InterviewSessionService } from '../services/interview-session.service';
import { StartInterviewDto } from '../dto/start-interview.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { FinishSessionDto } from '../dto/finish-session.dto';
import { CandidateSessionResponseDto } from '../dto/session-response.dto';

@Controller('candidate')
@UseGuards(CandidateInterviewAccessGuard)
export class CandidateSessionController {
  constructor(private readonly sessionService: InterviewSessionService) {}

  /**
   * POST /api/v1/candidate/interview/start
   * Khởi động phiên phỏng vấn (Start)
   */
  @Post('interview/start')
  async start(
    @CurrentInterviewAccessCookie() cookieToken: string,
    @Body() dto: StartInterviewDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CandidateSessionResponseDto> {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );

    const result = await this.sessionService.startInterview(
      cookieToken,
      dto,
      idempotencyKey,
    );

    res.status(result.statusCode);

    // Nếu có gia hạn cookie (deadlineAt + 30m), cập nhật lại Set-Cookie
    if (result.newCookieExpiresAt) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie(CANDIDATE_COOKIE_NAME, cookieToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        expires: result.newCookieExpiresAt,
        path: '/',
      });
    }

    return result.response;
  }

  /**
   * GET /api/v1/candidate/session
   * Lấy trạng thái hiện tại của phiên phỏng vấn để làm tiếp hoặc resume
   */
  @Get('session')
  async getSession(
    @CurrentInterviewAccessCookie() cookieToken: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CandidateSessionResponseDto> {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    return this.sessionService.getSession(cookieToken);
  }

  /**
   * POST /api/v1/candidate/session/answers
   * Nộp câu trả lời hoặc bỏ qua (skip) cho câu hỏi hiện tại
   */
  @Post('session/answers')
  @HttpCode(HttpStatus.OK)
  async submitAnswer(
    @CurrentInterviewAccessCookie() cookieToken: string,
    @Body() dto: SubmitAnswerDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CandidateSessionResponseDto> {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    return this.sessionService.submitAnswer(cookieToken, dto, idempotencyKey);
  }

  /**
   * POST /api/v1/candidate/session/finish
   * Kết thúc buổi phỏng vấn (khi hết câu hỏi hoặc ứng viên chủ động kết thúc sớm)
   */
  @Post('session/finish')
  @HttpCode(HttpStatus.OK)
  async finishSession(
    @CurrentInterviewAccessCookie() cookieToken: string,
    @Body() dto: FinishSessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CandidateSessionResponseDto> {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    return this.sessionService.finishSession(cookieToken, dto, idempotencyKey);
  }
}
