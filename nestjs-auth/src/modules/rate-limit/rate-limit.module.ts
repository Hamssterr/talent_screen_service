import { ThrottlerModule } from '@nestjs/throttler';
import { Module, Global } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          // Mặc định cho toàn bộ Project: 10 lần / 60 giây (1 phút)
          ttl: configService.get<number>('THROTTLE_TTL', 60000),
          limit: configService.get<number>('THROTTLE_LIMIT', 10),
        },
      ],
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
