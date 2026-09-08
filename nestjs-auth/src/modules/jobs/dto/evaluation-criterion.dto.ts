import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { randomUUID } from 'crypto';

export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
}

export class EvaluationCriterionDto {
  @ApiPropertyOptional({
    description: 'UUID của tiêu chí đánh giá (bỏ trống nếu tạo mới)',
    example: 'd9b2d63d-a233-4123-8478-435213b19021',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: 'Tên tiêu chí đánh giá (1-120 ký tự)',
    example: 'Kiến thức NestJS & TypeScript',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên tiêu chí không được để trống' })
  @Length(1, 120, { message: 'Tên tiêu chí từ 1 đến 120 ký tự' })
  name: string;

  @ApiProperty({
    description: 'Mô tả chi tiết tiêu chí đánh giá (1-1000 ký tự)',
    example:
      'Hiểu rõ dependency injection, guard, interceptor và TypeORM transactions',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả tiêu chí không được để trống' })
  @Length(1, 1000, { message: 'Mô tả tiêu chí từ 1 đến 1000 ký tự' })
  description: string;
}

export function normalizeEvaluationCriteria(
  criteria?: EvaluationCriterionDto[],
): EvaluationCriterion[] {
  if (!criteria || !Array.isArray(criteria)) return [];

  const normalized: EvaluationCriterion[] = [];
  const seenIds = new Set<string>();

  for (const item of criteria) {
    if (
      !item ||
      typeof item.name !== 'string' ||
      typeof item.description !== 'string'
    ) {
      continue;
    }

    const trimmedName = item.name.trim();
    const trimmedDesc = item.description.trim();
    if (!trimmedName || !trimmedDesc) continue;

    let criterionId = item.id?.trim();
    if (!criterionId || seenIds.has(criterionId)) {
      criterionId = randomUUID();
    }

    seenIds.add(criterionId);
    normalized.push({
      id: criterionId,
      name: trimmedName,
      description: trimmedDesc,
    });

    if (normalized.length >= 10) break;
  }

  return normalized;
}
