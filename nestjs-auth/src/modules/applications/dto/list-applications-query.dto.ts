import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ApplicationListScope } from '../enums/application-list-scope.enum';

export class ListApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  jobId?: string;

  @IsOptional()
  @IsUUID('4')
  candidateId?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsEnum(ApplicationListScope)
  scope?: ApplicationListScope = ApplicationListScope.ALL;
}
