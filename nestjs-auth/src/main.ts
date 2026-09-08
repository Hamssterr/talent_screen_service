import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 1. Security Headers (Nên đặt đầu tiên để mọi request đều được bảo vệ)
  app.use(helmet());

  // 2. Trust proxy (để Express đọc đúng IP từ reverse proxy/load balancer)
  app.set('trust proxy', 1);

  // 3. CORS (Nên đặt sớm để xử lý cross-origin trước khi parse body/cookie)
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // 4. Global Prefix
  app.setGlobalPrefix('api/v1');

  // 5. Middlewares
  app.use(cookieParser());

  // 6. Global Pipes (Validation)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 7. Global Filters & Interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformResponseInterceptor(reflector));

  // 8. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // 9. OpenAPI / Swagger (/api/docs)
  const configService = app.get(ConfigService);
  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') !== 'false' &&
    configService.get<string>('NODE_ENV') !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Talent Screen Service API')
      .setDescription(
        'Tài liệu API Xác thực (Auth), Quản trị (Admin) và Nền tảng (Platform Foundation)',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập JWT Access Token',
        },
        'bearerAuth',
      )
      .addCookieAuth(
        'refreshToken',
        {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
          description: 'HttpOnly Refresh Token Cookie',
        },
        'cookieAuth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', err);
  process.exit(1);
});
