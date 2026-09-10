import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionDifficulty } from '../enums/question-difficulty.enum';

export class QuestionSetItemInputDto {
  @ApiProperty({
    description: 'Thứ tự vị trí câu hỏi, bắt đầu từ 1 và liên tục',
    example: 1,
    minimum: 1,
    maximum: 12,
  })
  @IsInt({ message: 'position phải là số nguyên' })
  @Min(1, { message: 'position tối thiểu là 1' })
  @Max(12, { message: 'position tối đa là 12' })
  position: number;

  @ApiProperty({
    description: 'Nội dung câu hỏi (từ 5 đến 2000 ký tự)',
    example:
      'Bạn hãy mô tả kinh nghiệm áp dụng NestJS guards trong dự án thực tế?',
    minLength: 5,
    maxLength: 2000,
  })
  @IsString({ message: 'text phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'text không được để trống' })
  @Length(5, 2000, { message: 'text phải có độ dài từ 5 đến 2000 ký tự' })
  text: string;

  @ApiPropertyOptional({
    description: 'Năng lực cần kiểm tra (tối đa 150 ký tự)',
    example: 'Backend Architecture',
    maxLength: 150,
  })
  @IsOptional()
  @IsString({ message: 'competency phải là chuỗi ký tự' })
  @Length(1, 150, { message: 'competency tối đa 150 ký tự' })
  competency?: string | null;

  @ApiPropertyOptional({
    description: 'ID tiêu chí đánh giá thuộc Job evaluationCriteria',
    example: 'd9b2d63d-a233-4123-8478-435213b19021',
  })
  @IsOptional()
  @IsString({ message: 'evaluationCriterionId phải là chuỗi ký tự' })
  evaluationCriterionId?: string | null;

  @ApiPropertyOptional({
    description: 'Mức độ khó của câu hỏi (basic, intermediate, advanced)',
    enum: QuestionDifficulty,
    default: QuestionDifficulty.INTERMEDIATE,
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: 'difficulty phải là basic, intermediate hoặc advanced',
  })
  difficulty?: QuestionDifficulty = QuestionDifficulty.INTERMEDIATE;

  @ApiPropertyOptional({
    description: 'Cho phép hỏi câu hỏi đào sâu/follow-up',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'allowFollowUp phải là boolean' })
  allowFollowUp?: boolean = true;

  @ApiPropertyOptional({
    description: 'Số câu hỏi đào sâu tối đa (0 đến 2)',
    default: 1,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsInt({ message: 'maxFollowUps phải là số nguyên' })
  @Min(0, { message: 'maxFollowUps tối thiểu là 0' })
  @Max(2, { message: 'maxFollowUps tối đa là 2' })
  maxFollowUps?: number = 1;

  @ApiPropertyOptional({
    description: 'Bằng chứng/dẫn chứng trích xuất từ CV hoặc tiêu chuẩn JD',
    example: ['CV: 3 years NestJS experience at VNG'],
  })
  @IsOptional()
  @IsArray({ message: 'evidenceRefs phải là mảng' })
  evidenceRefs?: unknown[] | null;

  @ApiPropertyOptional({
    description: 'Ghi chú đánh giá của người phỏng vấn/HR',
    example: 'Chú ý hỏi sâu về Microservices và RabbitMQ',
  })
  @IsOptional()
  @IsString({ message: 'reviewNotes phải là chuỗi ký tự' })
  reviewNotes?: string | null;
}
