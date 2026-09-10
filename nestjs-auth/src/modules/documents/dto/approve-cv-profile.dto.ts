import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class ApproveCvProfileDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedProfileVersion: number;
}
