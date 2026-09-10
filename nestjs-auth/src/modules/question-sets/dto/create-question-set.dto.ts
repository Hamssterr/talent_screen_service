import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionLanguage } from '../enums/question-language.enum';

export class CreateQuestionSetDto {
  @ApiProperty({
    description: 'UUID của phiên bản CV đã được duyệt gắn với hồ sơ ứng tuyển',
    example: '11111111-1111-4000-8000-111111111111',
  })
  @IsUUID('4', { message: 'cvVersionId phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'cvVersionId không được để trống' })
  cvVersionId: string;

  @ApiPropertyOptional({
    description: 'Ngôn ngữ của bộ câu hỏi (vi, en)',
    enum: QuestionLanguage,
    default: QuestionLanguage.VI,
  })
  @IsOptional()
  @IsEnum(QuestionLanguage, { message: 'language phải là vi hoặc en' })
  language?: QuestionLanguage = QuestionLanguage.VI;
}
