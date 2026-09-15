import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Service chuyên phụ trách việc gửi Email thông báo/xác thực cho người dùng.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendAccountInvitation(data: {
    email: string;
    name?: string;
    token: string;
  }) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3001',
    );
    const url = `${frontendUrl}/auth/activate-account?token=${encodeURIComponent(data.token)}`;
    const content = `
      <p>Quản trị viên đã tạo tài khoản cho bạn.</p>
      <p style="margin: 20px 0; text-align: center;">
        <a href="${url}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          Kích hoạt tài khoản
        </a>
      </p>
      <p>Hãy mở liên kết và tự đặt mật khẩu. Link hết hạn sau 48 giờ.</p>
    `;

    await this.mailerService.sendMail({
      to: data.email,
      subject: 'Lời mời kích hoạt tài khoản',
      html: this.buildHtmlTemplate(data.name, data.email, content),
    });
  }

  /**
   * Gửi email chứa đường link để người dùng đặt lại mật khẩu mới.
   */
  async sendPasswordResetEmail(data: {
    email: string;
    name?: string;
    token: string;
  }) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3001',
    );
    const url = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(data.token)}`;
    const content = `
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng bấm vào nút bên dưới để thiết lập mật khẩu mới:</p>
      <p style="margin: 20px 0; text-align: center;">
        <a href="${url}" style="padding: 10px 20px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          Đặt lại mật khẩu
        </a>
      </p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
      <p style="color: #ff5722;">Lưu ý: Link này sẽ hết hạn sau 15 phút.</p>
    `;

    try {
      await this.mailerService.sendMail({
        to: data.email,
        subject: 'Yêu cầu đặt lại mật khẩu',
        html: this.buildHtmlTemplate(data.name, data.email, content),
      });
      this.logger.log(`Email đặt lại mật khẩu đã gửi tới ${data.email}`);
    } catch (error) {
      this.logger.error(
        `Lỗi khi gửi email đặt lại mật khẩu tới ${data.email}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Gửi email cảnh báo bảo mật khi mật khẩu bị thay đổi.
   */
  async sendPasswordChangedAlert(data: { email: string; name?: string }) {
    const content = `
      <p>Chúng tôi gửi email này để thông báo rằng <strong>mật khẩu cho tài khoản của bạn vừa mới được thay đổi thành công.</strong></p>
      <p><strong>Nếu bạn là người thực hiện:</strong> Bạn có thể yên tâm bỏ qua email này.</p>
      <p style="color: #d32f2f; font-weight: bold; padding: 10px; background-color: #ffebee; border-left: 4px solid #f44336;">
        Nếu bạn KHÔNG thực hiện thay đổi này: Tài khoản của bạn có thể đang bị xâm phạm. Vui lòng sử dụng chức năng "Quên mật khẩu" để đặt lại ngay lập tức và liên hệ với quản trị viên.
      </p>
    `;

    try {
      await this.mailerService.sendMail({
        to: data.email,
        subject: 'Cảnh báo bảo mật: Mật khẩu của bạn vừa được thay đổi',
        html: this.buildHtmlTemplate(data.name, data.email, content),
      });
      this.logger.log(`Email cảnh báo đổi mật khẩu đã gửi tới ${data.email}`);
    } catch (error) {
      this.logger.error(
        `Lỗi khi gửi email cảnh báo đổi mật khẩu tới ${data.email}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Gửi email mời phỏng vấn cho Candidate (URL fragment #token=...)
   */
  async sendInterviewInvitation(data: {
    email: string;
    candidateName?: string;
    jobTitle: string;
    durationMinutes: number;
    invitationExpiresAt: Date;
    invitationUrl: string;
  }) {
    const formattedExpiry = new Date(data.invitationExpiresAt).toLocaleString(
      'vi-VN',
      { timeZone: 'Asia/Ho_Chi_Minh' },
    );
    const content = `
      <p>Bạn nhận được lời mời tham gia buổi phỏng vấn trực tuyến cho vị trí <strong>${escapeHtml(data.jobTitle)}</strong>.</p>
      <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Vị trí ứng tuyển:</strong> ${escapeHtml(data.jobTitle)}</p>
        <p style="margin: 0 0 8px 0;"><strong>Thời lượng làm bài:</strong> ${data.durationMinutes} phút</p>
        <p style="margin: 0;"><strong>Hạn chót truy cập:</strong> ${formattedExpiry} (Giờ Việt Nam)</p>
      </div>
      <p>Cuộc phỏng vấn hoàn toàn trực tuyến và bạn có thể chủ động lựa chọn thời điểm thích hợp để bắt đầu trước khi hết hạn.</p>
      <p style="margin: 25px 0; text-align: center;">
        <a href="${data.invitationUrl}" style="padding: 12px 25px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          Truy cập phòng chờ phỏng vấn
        </a>
      </p>
      <p style="font-size: 13px; color: #666;"><em>Lưu ý: Thời gian làm bài chỉ bắt đầu tính sau khi bạn đã đọc kỹ hướng dẫn trong phòng chờ và nhấn nút "Bắt đầu làm bài".</em></p>
    `;

    try {
      await this.mailerService.sendMail({
        to: data.email,
        subject: `[TalentScreen] Thư mời phỏng vấn - Vị trí ${data.jobTitle}`,
        html: this.buildHtmlTemplate(data.candidateName, data.email, content),
      });
      this.logger.log(`Email mời phỏng vấn đã gửi tới ${data.email}`);
    } catch (error) {
      this.logger.error(
        `Lỗi khi gửi email mời phỏng vấn tới ${data.email}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Gửi email thông báo hủy phỏng vấn cho Candidate
   */
  async sendInterviewCancelled(data: {
    email: string;
    candidateName?: string;
    jobTitle: string;
    reason?: string;
  }) {
    const reasonText = data.reason
      ? escapeHtml(data.reason)
      : 'Kế hoạch tuyển dụng thay đổi';
    const content = `
      <p>Chúng tôi gửi thư này để thông báo rằng lời mời phỏng vấn cho vị trí <strong>${escapeHtml(data.jobTitle)}</strong> đã bị hủy.</p>
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Lý do:</strong> ${reasonText}</p>
      </div>
      <p>Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ với bộ phận tuyển dụng.</p>
    `;

    try {
      await this.mailerService.sendMail({
        to: data.email,
        subject: `[TalentScreen] Thông báo hủy lịch phỏng vấn - Vị trí ${data.jobTitle}`,
        html: this.buildHtmlTemplate(data.candidateName, data.email, content),
      });
      this.logger.log(`Email hủy phỏng vấn đã gửi tới ${data.email}`);
    } catch (error) {
      this.logger.error(
        `Lỗi khi gửi email hủy phỏng vấn tới ${data.email}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Tạo giao diện HTML chung cho các email của hệ thống.
   */
  private buildHtmlTemplate(
    name: string | undefined,
    email: string,
    contentHtml: string,
  ): string {
    const displayName = escapeHtml(name || email);
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h3 style="color: #2c3e50;">Xin chào ${displayName},</h3>
        ${contentHtml}
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Đây là email tự động, vui lòng không trả lời.</p>
      </div>
    `;
  }
}
