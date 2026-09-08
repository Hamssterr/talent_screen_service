import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../enums/job-status.enum';
import { EvaluationCriterion } from './evaluation-criterion.dto';
import { Job } from '../entities/job.entity';

export class JobResponseDto {
  @ApiProperty({ description: 'ID vị trí tuyển dụng (UUID)' })
  id: string;

  @ApiProperty({ description: 'ID người tạo Job (User UUID)' })
  ownerId: string;

  @ApiProperty({ description: 'Tiêu đề vị trí tuyển dụng' })
  title: string;

  @ApiProperty({ description: 'Mô tả vị trí tuyển dụng' })
  description: string;

  @ApiProperty({ description: 'Danh sách kỹ năng yêu cầu', type: [String] })
  requiredSkills: string[];

  @ApiProperty({ description: 'Danh sách tiêu chí đánh giá', type: [Object] })
  evaluationCriteria: EvaluationCriterion[];

  @ApiProperty({ description: 'Trạng thái tuyển dụng', enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ description: 'Phiên bản dữ liệu (optimistic lock)' })
  version: number;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt: Date;

  @ApiProperty({ description: 'Thời gian cập nhật gần nhất' })
  updatedAt: Date;

  static fromEntity(job: Job): JobResponseDto {
    return {
      id: job.id,
      ownerId: job.ownerId,
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills ?? [],
      evaluationCriteria: job.evaluationCriteria ?? [],
      status: job.status,
      version: job.version,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
