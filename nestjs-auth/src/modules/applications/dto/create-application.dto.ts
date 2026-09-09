import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateApplicationDto {
  @IsUUID('4')
  @IsNotEmpty()
  candidateId: string;

  @IsUUID('4')
  @IsNotEmpty()
  jobId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
