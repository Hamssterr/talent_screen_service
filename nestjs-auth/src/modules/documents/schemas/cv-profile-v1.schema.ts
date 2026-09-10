import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CvSkillEvidenceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  quote?: string;
}

export class CvSkillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CvSkillEvidenceDto)
  evidence?: CvSkillEvidenceDto;
}

export class CvExperienceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  role: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  organization: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description: string | null;
}

export class CvProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  @MaxLength(100, { each: true })
  technologies: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contribution: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CvSkillEvidenceDto)
  evidence?: CvSkillEvidenceDto;
}

export class CvEducationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  institution: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  degree: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  field: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate: string | null;
}

export class CvProfileV1Dto {
  @IsString()
  @IsNotEmpty()
  schemaVersion = 'profile.v1' as const;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  summary: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CvSkillDto)
  @ArrayMaxSize(50)
  skills: CvSkillDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CvExperienceDto)
  @ArrayMaxSize(30)
  experiences: CvExperienceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CvProjectDto)
  @ArrayMaxSize(30)
  projects: CvProjectDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CvEducationDto)
  @ArrayMaxSize(20)
  education: CvEducationDto[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(300, { each: true })
  missingInformation: string[];
}
