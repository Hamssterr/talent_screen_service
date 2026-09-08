import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '../enums/job-status.enum';
import { EvaluationCriterionDto } from './evaluation-criterion.dto';

export class UpdateJobDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Job trước khi cập nhật (bắt buộc để chống race condition)',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;

  @ApiPropertyOptional({
    description: 'Tiêu đề vị trí tuyển dụng (1-200 ký tự)',
    example: 'Senior Backend NestJS Developer',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @Length(1, 200, { message: 'Tiêu đề từ 1 đến 200 ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết vị trí tuyển dụng (1-20000 ký tự)',
    example: 'Cập nhật mô tả tuyển dụng vị trí Senior...',
    minLength: 1,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @IsNotEmpty({ message: 'Mô tả không được để trống' })
  @Length(1, 20000, { message: 'Mô tả từ 1 đến 20.000 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Danh sách kỹ năng yêu cầu (tối đa 50 kỹ năng)',
    example: ['NestJS', 'PostgreSQL', 'Redis', 'Docker'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'requiredSkills phải là danh sách' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 kỹ năng' })
  @IsString({ each: true, message: 'Mỗi kỹ năng phải là chuỗi' })
  requiredSkills?: string[];

  @ApiPropertyOptional({
    description: 'Danh sách tiêu chí đánh giá chung (tối đa 10 tiêu chí)',
    type: [EvaluationCriterionDto],
  })
  @IsOptional()
  @IsArray({ message: 'evaluationCriteria phải là danh sách' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 tiêu chí đánh giá' })
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionDto)
  evaluationCriteria?: EvaluationCriterionDto[];

  @ApiPropertyOptional({
    description:
      'Trạng thái chuyển đổi (chỉ cho phép draft hoặc open qua PATCH, không cho đóng)',
    enum: [JobStatus.DRAFT, JobStatus.OPEN],
  })
  @IsOptional()
  @IsEnum([JobStatus.DRAFT, JobStatus.OPEN], {
    message:
      'Qua PATCH chỉ cho phép chuyển đổi sang draft hoặc open (không được đóng)',
  })
  status?: JobStatus.DRAFT | JobStatus.OPEN;
}
