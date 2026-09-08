import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { JobStatus } from '../enums/job-status.enum';
import { JobListScope } from '../enums/job-list-scope.enum';

export class ListJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái Job',
    enum: JobStatus,
  })
  @IsOptional()
  @IsEnum(JobStatus, { message: 'status phải là draft, open hoặc closed' })
  status?: JobStatus;

  @ApiPropertyOptional({
    description:
      'Phạm vi lấy danh sách: all (mặc định), mine (chỉ của tôi), shared (của HR khác đang open)',
    enum: JobListScope,
    default: JobListScope.ALL,
  })
  @IsOptional()
  @IsEnum(JobListScope, { message: 'scope phải là all, mine hoặc shared' })
  scope?: JobListScope = JobListScope.ALL;
}
