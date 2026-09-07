import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  logger.log(
    'Worker process successfully initialized and listening for queue jobs...',
  );

  const gracefulShutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Shutting down worker gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
}

void bootstrap().catch((err: unknown) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error('Failed to start worker process', err);
  process.exit(1);
});
