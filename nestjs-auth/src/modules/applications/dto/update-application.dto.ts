import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion: number;
}
