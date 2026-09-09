import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class WithdrawApplicationDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion: number;
}
