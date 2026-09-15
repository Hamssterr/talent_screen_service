import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation } from '../entities/invitation.entity';
import { InterviewAccessCredential } from '../entities/interview-access-credential.entity';
import { Interview } from '../entities/interview.entity';
import { InterviewStatus } from '../enums/interview-status.enum';
import { InvitationTokenService } from './invitation-token.service';
import { CandidateLobbyDto } from '../dto/interview-response.dto';
import { ErrorCodes } from '../../../common/errors/error-codes';

export const CANDIDATE_COOKIE_NAME = 'interview_access';

@Injectable()
export class CandidateAccessService {
  private readonly logger = new Logger(CandidateAccessService.name);

  constructor(
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
    @InjectRepository(InterviewAccessCredential)
    private readonly credentialRepository: Repository<InterviewAccessCredential>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    private readonly tokenService: InvitationTokenService,
  ) {}

  /**
   * Đổi raw invitation token từ email thành opaque cookie token
   * Cho phép khi interview ở status invited, hoặc in_progress (để resume thiết bị khác)
   */
  async exchangeToken(rawToken: string): Promise<{
    interviewId: string;
    rawCookieToken: string;
    cookieExpiresAt: Date;
  }> {
    const tokenHash = this.tokenService.hashToken(rawToken);

    const invitation = await this.invitationRepository.findOne({
      where: { tokenHash },
      relations: { interview: true },
    });

    if (!invitation || !invitation.interview) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn không hợp lệ hoặc không còn khả dụng',
      });
    }

    const now = new Date();
    const interview = invitation.interview;

    // 1. Kiểm tra revocation & expiry của Invitation
    if (invitation.revokedAt || invitation.expiresAt < now) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn đã hết hạn hoặc bị thu hồi',
      });
    }

    // 2. Kiểm tra invitationVersion phải khớp Interview
    if (invitation.invitationVersion !== interview.invitationVersion) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn không còn hiệu lực do đã được cấp lại',
      });
    }

    // 3. Kiểm tra Interview status (cho phép invited hoặc in_progress để resume)
    if (
      interview.status !== InterviewStatus.INVITED &&
      interview.status !== InterviewStatus.IN_PROGRESS
    ) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Buổi phỏng vấn không ở trạng thái sẵn sàng để truy cập',
      });
    }

    // 4. Tạo opaque cookie token (32 bytes entropy)
    const rawCookieToken = this.tokenService.generateToken();
    const cookieTokenHash = this.tokenService.hashToken(rawCookieToken);

    // Hạn của cookie: tối thiểu đến invitation.expiresAt, nếu in_progress cấp ít nhất 24h buffer
    let cookieExpiresAt = invitation.expiresAt;
    if (interview.status === InterviewStatus.IN_PROGRESS) {
      const resumeGrace = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (cookieExpiresAt < resumeGrace) {
        cookieExpiresAt = resumeGrace;
      }
    }

    const credential = this.credentialRepository.create({
      invitationId: invitation.id,
      tokenHash: cookieTokenHash,
      expiresAt: cookieExpiresAt,
      lastSeenAt: now,
    });

    await this.credentialRepository.save(credential);

    // Cập nhật lastExchangedAt cho Invitation
    invitation.lastExchangedAt = now;
    await this.invitationRepository.save(invitation);

    return {
      interviewId: interview.id,
      rawCookieToken,
      cookieExpiresAt,
    };
  }

  /**
   * Xác thực cookie và tải thông tin phòng chờ Lobby (chỉ đọc)
   */
  async getLobby(rawCookieToken: string): Promise<CandidateLobbyDto> {
    const tokenHash = this.tokenService.hashToken(rawCookieToken);

    const credential = await this.credentialRepository.findOne({
      where: { tokenHash },
      relations: {
        invitation: {
          interview: {
            application: {
              candidate: true,
              job: true,
            },
            questions: true,
          },
        },
      },
    });

    if (
      !credential ||
      !credential.invitation ||
      !credential.invitation.interview
    ) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Phiên truy cập phỏng vấn không hợp lệ',
      });
    }

    const now = new Date();

    // Kiểm tra revocation & expiry của credential
    if (credential.revokedAt || credential.expiresAt < now) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Phiên truy cập phỏng vấn đã hết hạn hoặc bị thu hồi',
      });
    }

    const invitation = credential.invitation;
    const interview = invitation.interview;

    if (!interview) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Không tìm thấy thông tin buổi phỏng vấn',
      });
    }

    if (invitation.revokedAt || invitation.expiresAt < now) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn đã hết hạn hoặc bị thu hồi',
      });
    }

    if (invitation.invitationVersion !== interview.invitationVersion) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn đã được cấp lại mới',
      });
    }

    // Cho phép xem lobby khi invited hoặc in_progress (khi đã start thì client có thể chuyển sang trang session)
    if (
      interview.status !== InterviewStatus.INVITED &&
      interview.status !== InterviewStatus.IN_PROGRESS
    ) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Buổi phỏng vấn không ở trạng thái chờ truy cập',
      });
    }

    // Cập nhật lastSeenAt cho credential
    credential.lastSeenAt = now;
    await this.credentialRepository.save(credential);

    // Lấy thông tin ứng viên và công việc từ application hoặc snapshot
    const app = interview.application;
    const candidateName =
      app?.candidate?.fullName ||
      (interview.profileSnapshot?.fullName as string) ||
      'Ứng viên';

    const jobTitle =
      app?.job?.title ||
      (interview.jobSnapshot?.title as string) ||
      'Vị trí ứng tuyển';

    const totalQuestions = interview.questions?.length || 0;

    const instructions = [
      'Cuộc phỏng vấn được thực hiện bằng hình thức trả lời văn bản trực tuyến.',
      `Tổng thời gian làm bài là ${interview.durationMinutes} phút và chỉ bắt đầu tính khi bạn nhấn nút "Bắt đầu làm bài".`,
      `Bạn cần hoàn thành trước thời hạn: ${interview.invitationExpiresAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      'Hãy chuẩn bị không gian yên tĩnh và đường truyền mạng ổn định trước khi bắt đầu.',
    ];

    const canStart =
      interview.status === InterviewStatus.INVITED &&
      now <= interview.invitationExpiresAt;

    return {
      interviewId: interview.id,
      candidateName,
      jobTitle,
      status: interview.status,
      language: interview.language,
      invitationExpiresAt: interview.invitationExpiresAt,
      durationMinutes: interview.durationMinutes,
      totalQuestions,
      instructions,
      canStart,
      serverNow: now,
      consentVersion: 'v1',
      consentText:
        'Tôi đồng ý tham gia quá trình phỏng vấn sàng lọc năng lực trực tuyến và xác nhận các câu trả lời do chính tôi thực hiện.',
    };
  }
}
