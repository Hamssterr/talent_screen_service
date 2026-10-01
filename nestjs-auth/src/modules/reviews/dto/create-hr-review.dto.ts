import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HrReviewFindingDto {
  @ApiProperty({
    example: 'Ứng viên nắm vững kiến thức về TypeScript và NestJS.',
    description: 'Nội dung nhận định',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  statement: string;

  @ApiProperty({
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Danh sách turnId làm bằng chứng xác thực',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceTurnIds: string[];
}

export class HrCriterionAssessmentDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID của tiêu chí trong job evaluation criteria',
  })
  @IsUUID('4')
  @IsNotEmpty()
  criterionId: string;

  @ApiPropertyOptional({
    example: 'Kỹ năng NestJS',
    description: 'Tên tiêu chí đánh giá',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  criterionName?: string;

  @ApiProperty({
    example: 4,
    description: 'Điểm đánh giá từ 1 đến 5',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Trả lời lưu loát, hiểu rõ lifecycle và middleware.',
    description: 'Nhận xét chi tiết cho tiêu chí',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Danh sách turnId làm bằng chứng cho tiêu chí',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceTurnIds?: string[];
}

export class CreateHrReviewDto {
  @ApiProperty({
    example:
      'Ứng viên thể hiện thái độ tốt, kiến thức nền tảng vững vàng, phù hợp với vị trí Senior Backend Engineer.',
    description: 'Nhận xét tổng quan của HR',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(3000)
  overallAssessment: string;

  @ApiProperty({
    type: [HrReviewFindingDto],
    description: 'Danh sách điểm mạnh (tối đa 10 mục)',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HrReviewFindingDto)
  strengths: HrReviewFindingDto[];

  @ApiProperty({
    type: [HrReviewFindingDto],
    description: 'Danh sách điểm cần cải thiện/hạn chế (tối đa 10 mục)',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HrReviewFindingDto)
  gaps: HrReviewFindingDto[];

  @ApiProperty({
    type: [HrCriterionAssessmentDto],
    description: 'Đánh giá theo từng tiêu chí (1-10 tiêu chí)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => HrCriterionAssessmentDto)
  criterionAssessments: HrCriterionAssessmentDto[];

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID của AI Summary được HR tham khảo (nếu có)',
  })
  @IsOptional()
  @IsUUID('4')
  basedOnAiSummaryId?: string;
}
