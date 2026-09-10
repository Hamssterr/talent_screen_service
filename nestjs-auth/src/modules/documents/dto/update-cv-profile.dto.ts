import { IsInt, IsNotEmpty, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CvProfileV1Dto } from '../schemas/cv-profile-v1.schema';

export class UpdateCvProfileDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedProfileVersion: number;

  @ValidateNested()
  @Type(() => CvProfileV1Dto)
  @IsNotEmpty()
  profile: CvProfileV1Dto;
}
