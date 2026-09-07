import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const { redisStore } = await (eval(
          `import('cache-manager-redis-yet')`,
        ) as Promise<typeof import('cache-manager-redis-yet')>);

        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const url = `redis://${host}:${port}`;

        return {
          store: await redisStore({
            url,
            password: configService.get<string>('REDIS_PASSWORD'),
          }),
        };
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
