import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Lấy giá trị từ Redis bằng Key
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Lưu giá trị vào Redis
   * @param key Tên định danh
   * @param value Giá trị cần lưu
   * @param ttlSeconds Thời gian sống tính bằng giây
   */
  async set(
    key: string,
    value: string | number | boolean | Record<string, unknown>,
    ttlSeconds?: number,
  ): Promise<void> {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : undefined;
    await this.cacheManager.set(key, value, ttlMs);
  }

  /**
   * Xóa một Key khỏi Redis
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
