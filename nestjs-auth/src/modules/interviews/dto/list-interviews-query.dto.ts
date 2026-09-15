import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { InterviewStatus } from '../enums/interview-status.enum';

export class ListInterviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái phỏng vấn',
    enum: InterviewStatus,
  })
  @IsOptional()
  @IsEnum(InterviewStatus, { message: 'status không hợp lệ' })
  status?: InterviewStatus;

  @ApiPropertyOptional({
    description: 'Lọc các phỏng vấn hết hạn trước thời điểm này (ISO-8601)',
  })
  @IsOptional()
  @IsString()
  expiresBefore?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID công việc (Job)',
  })
  @IsOptional()
  @IsUUID('4')
  jobId?: string;

  @ApiPropertyOptional({
    description:
      'Phạm vi tìm kiếm (mine: do mình tạo, job_owned: thuộc Job của mình, all: cả hai)',
    enum: ['mine', 'job_owned', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['mine', 'job_owned', 'all'], {
    message: 'scope phải là mine, job_owned hoặc all',
  })
  scope?: 'mine' | 'job_owned' | 'all' = 'all';
}
