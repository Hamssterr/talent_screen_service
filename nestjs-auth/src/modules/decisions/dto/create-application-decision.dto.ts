import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DecisionOutcome } from '../enums/decision-outcome.enum';

export class CreateApplicationDecisionDto {
  @ApiProperty({
    enum: DecisionOutcome,
    example: DecisionOutcome.APPROVED,
    description: 'Kết quả quyết định: approved hoặc rejected',
  })
  @IsEnum(DecisionOutcome)
  outcome: DecisionOutcome;

  @ApiProperty({
    example:
      'Ứng viên đáp ứng đầy đủ tiêu chí kỹ thuật, giao tiếp tốt và có kinh nghiệm thực tế phù hợp.',
    description: 'Lý do nội bộ của HR/Hiring team (lưu trữ nội bộ)',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  internalReason: string;

  @ApiPropertyOptional({
    example: 'Chúc mừng bạn đã vượt qua vòng phỏng vấn kỹ thuật của chúng tôi!',
    description:
      'Nội dung tin nhắn gửi cho ứng viên trong email thông báo (nếu có)',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  candidateMessage?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Có gửi email thông báo kết quả cho ứng viên hay không (mặc định: false)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyCandidate?: boolean;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID buổi phỏng vấn làm căn cứ ra quyết định',
  })
  @IsUUID('4')
  basisInterviewId: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID phiên phỏng vấn làm căn cứ ra quyết định',
  })
  @IsUUID('4')
  basisSessionId: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      'ID bản đánh giá HR (Evaluation type hr_review) làm căn cứ ra quyết định',
  })
  @IsUUID('4')
  basisHrReviewId: string;

  @ApiProperty({
    example: 1,
    description:
      'Phiên bản kỳ vọng của Application để kiểm soát đồng thời lạc quan (OCC)',
  })
  @IsInt()
  @Min(1)
  expectedApplicationVersion: number;
}
