import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../app.module';
import { AI_PROVIDER } from '../modules/ai/constants/ai-provider.token';
import { AiProvider } from '../modules/ai/contracts/ai-provider.interface';

async function bootstrap() {
  console.log('--- Bắt đầu kiểm tra Gemini AI Provider nội bộ ---');

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  if (!apiKey || !apiKey.trim() || !model || !model.trim()) {
    console.error(
      'LỖI: Chưa cấu hình GEMINI_API_KEY hoặc GEMINI_MODEL trong biến môi trường.',
    );
    console.error(
      'Vui lòng cấu hình đầy đủ GEMINI_API_KEY và GEMINI_MODEL trong file .env trước khi chạy script này.',
    );
    process.exit(1);
  }

  // Khởi tạo Nest Application Context (không mở HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const aiProvider = app.get<AiProvider>(AI_PROVIDER);

    // Schema nhỏ và an toàn để kiểm tra, không chứa thông tin nhạy cảm
    const verificationSchema = z.object({
      status: z.enum(['ok', 'healthy']),
      message: z.string(),
      timestamp: z.string(),
    });

    console.log(`Đang gửi request test tới model: ${model}...`);

    const result = await aiProvider.generateStructured({
      systemInstruction:
        'Bạn là trợ lý kiểm tra hệ thống. Luôn trả lời bằng định dạng JSON chính xác theo schema yêu cầu.',
      prompt:
        'Hãy xác nhận hệ thống hoạt động tốt bằng cách trả về status "ok", message "Gemini integration is operational", và timestamp thời gian hiện tại theo ISO-8601.',
      schema: verificationSchema,
      timeoutMs: 15000,
      temperature: 0.1,
    });

    console.log('--- KẾT QUẢ KIỂM TRA THÀNH CÔNG ---');
    console.log(`Provider: ${result.provider}`);
    console.log(`Model: ${result.model}`);
    console.log(`Latency: ${result.latencyMs}ms`);
    console.log(`Input Tokens: ${result.inputTokens ?? 'N/A'}`);
    console.log(`Output Tokens: ${result.outputTokens ?? 'N/A'}`);
    console.log(
      'Data đã validate thành công:',
      JSON.stringify(result.data, null, 2),
    );
  } catch (error) {
    console.error('--- KIỂM TRA THẤT BẠI ---');
    console.error(error instanceof Error ? error.message : error);
    await app.close();
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Unhandled bootstrap error:', err);
  process.exit(1);
});
