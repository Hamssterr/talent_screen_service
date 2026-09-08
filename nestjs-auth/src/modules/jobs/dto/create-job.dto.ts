import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '../enums/job-status.enum';
import { EvaluationCriterionDto } from './evaluation-criterion.dto';

export class CreateJobDto {
  @ApiProperty({
    description: 'Tiêu đề vị trí tuyển dụng (1-200 ký tự)',
    example: 'Backend NestJS Developer',
    minLength: 1,
    maxLength: 200,
  })
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @Length(1, 200, { message: 'Tiêu đề từ 1 đến 200 ký tự' })
  title: string;

  @ApiProperty({
    description: 'Mô tả chi tiết vị trí tuyển dụng (1-20000 ký tự)',
    example: 'Tuyển Backend Developer sử dụng NestJS, PostgreSQL và Docker...',
    minLength: 1,
    maxLength: 20000,
  })
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @IsNotEmpty({ message: 'Mô tả không được để trống' })
  @Length(1, 20000, { message: 'Mô tả từ 1 đến 20.000 ký tự' })
  description: string;

  @ApiPropertyOptional({
    description:
      'Danh sách kỹ năng yêu cầu (tối đa 50 kỹ năng, mỗi kỹ năng 1-100 ký tự)',
    example: ['NestJS', 'PostgreSQL', 'TypeORM', 'Docker'],
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
      'Trạng thái khởi tạo của Job (draft hoặc open, mặc định draft)',
    enum: [JobStatus.DRAFT, JobStatus.OPEN],
    default: JobStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum([JobStatus.DRAFT, JobStatus.OPEN], {
    message: 'Khi tạo mới, trạng thái chỉ có thể là draft hoặc open',
  })
  status?: JobStatus.DRAFT | JobStatus.OPEN;
}
