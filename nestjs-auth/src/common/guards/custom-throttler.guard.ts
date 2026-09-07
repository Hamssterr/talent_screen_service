import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  /**
   * Ghi đè hàm lấy tracker (định danh người dùng) để đọc đúng IP thật
   * khi hệ thống chạy đằng sau Nginx, Cloudflare hoặc Load Balancer.
   */
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const expressReq = req as unknown as Request;
    return Promise.resolve(expressReq.ip || 'unknown-ip');
  }
}
