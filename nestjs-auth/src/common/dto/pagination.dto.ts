import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit?: number = 10;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 10);
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export function createPaginationResult<T>(
  data: T[],
  totalItems: number,
  query: PaginationQueryDto = new PaginationQueryDto(),
): PaginatedResult<T> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

  return {
    data,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: totalPages > 0 && page < totalPages,
      hasPreviousPage: page > 1 && (totalPages === 0 || page <= totalPages + 1),
    },
  };
}
