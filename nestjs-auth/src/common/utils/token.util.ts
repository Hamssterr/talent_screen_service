import { createHash, randomBytes } from 'crypto';

/**
 * Tiện ích hỗ trợ xử lý mã thông báo (Token Utils).
 * Cung cấp các hàm sinh token ngẫu nhiên và mã hóa (hash) token để lưu trữ bảo mật trong database.
 */
export class TokenUtil {
  /**
   * Sinh ra một chuỗi token ngẫu nhiên dài 64 ký tự (dạng hex).
   * @returns {string} Chuỗi token ngẫu nhiên
   */
  static generateRawToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Mã hóa một chuỗi token bằng thuật toán SHA-256.
   * Thường dùng để băm token trước khi lưu vào cơ sở dữ liệu để chống lộ lọt.
   * @param {string} token - Chuỗi token nguyên gốc cần mã hóa
   * @returns {string} Chuỗi token đã được băm (hash)
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
