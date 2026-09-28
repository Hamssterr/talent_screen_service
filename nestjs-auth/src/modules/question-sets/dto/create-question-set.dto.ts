import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionLanguage } from '../enums/question-language.enum';
import { QuestionSetMode } from '../enums/question-set-mode.enum';

export class CreateQuestionSetDto {
  @ApiPropertyOptional({
    description: 'Chế độ tạo: manual hoặc ai',
    enum: QuestionSetMode,
    default: QuestionSetMode.MANUAL,
  })
  @IsOptional()
  @IsEnum(QuestionSetMode, { message: 'mode phải là manual hoặc ai' })
  mode?: QuestionSetMode = QuestionSetMode.MANUAL;

  @ApiPropertyOptional({
    description:
      'UUID của phiên bản CV (bắt buộc với mode=manual, tự động lấy currentCvVersionId với mode=ai nếu bỏ trống)',
    example: '11111111-1111-4000-8000-111111111111',
  })
  @ValidateIf(
    (o: CreateQuestionSetDto) => !o.mode || o.mode === QuestionSetMode.MANUAL,
  )
  @IsNotEmpty({ message: 'cvVersionId không được để trống khi mode=manual' })
  @IsUUID('4', { message: 'cvVersionId phải là UUID hợp lệ' })
  cvVersionId?: string;

  @ApiPropertyOptional({
    description: 'Ngôn ngữ của bộ câu hỏi (vi, en)',
    enum: QuestionLanguage,
    default: QuestionLanguage.VI,
  })
  @IsOptional()
  @IsEnum(QuestionLanguage, { message: 'language phải là vi hoặc en' })
  language?: QuestionLanguage = QuestionLanguage.VI;

  @ApiPropertyOptional({
    description:
      'Số lượng câu hỏi yêu cầu tạo (từ 1 đến 12, chỉ áp dụng cho mode=ai)',
    example: 6,
    default: 6,
  })
  @IsOptional()
  @IsInt({ message: 'questionCount phải là số nguyên' })
  @Min(1, { message: 'questionCount tối thiểu là 1' })
  @Max(12, { message: 'questionCount tối đa là 12' })
  questionCount?: number = 6;
}
