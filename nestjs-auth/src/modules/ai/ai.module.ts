import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiRun } from './entities/ai-run.entity';
import { AI_PROVIDER } from './constants/ai-provider.token';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { AiService } from './ai.service';
import { AiRunService } from './services/ai-run.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AiRun])],
  providers: [
    GeminiAiProvider,
    {
      provide: AI_PROVIDER,
      useExisting: GeminiAiProvider,
    },
    AiService,
    AiRunService,
  ],
  exports: [AiService, AiRunService],
})
export class AiModule {}
