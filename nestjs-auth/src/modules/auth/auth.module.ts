import { Module } from '@nestjs/common';
import { AuthService } from './service/auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { ActionToken } from './entities/action-token.entity';
import { LoginAttempt } from './entities/login-attempt.entity';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RefreshTokenService } from './service/refresh-token.service';
import { ActionTokenService } from './service/action-token.service';
import { LoginAttemptService } from './service/login-attempt.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken, ActionToken, LoginAttempt]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET')!,
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
            '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    AuthService,
    RefreshTokenService,
    ActionTokenService,
    LoginAttemptService,
  ],
  exports: [ActionTokenService, RefreshTokenService, LoginAttemptService],
})
export class AuthModule {}
