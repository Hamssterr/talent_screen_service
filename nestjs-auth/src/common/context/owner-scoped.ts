import { NotFoundException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export interface OwnerScopedRequest {
  ownerId: string;
}

/**
 * Helper kiểm tra quyền sở hữu resource.
 * Nếu không khớp, ném NotFoundException (404) để không làm lộ sự tồn tại của resource thuộc về người khác.
 */
export function assertResourceOwner(
  resourceOwnerId: string,
  actorUserId: string,
  resourceName = 'Resource',
): void {
  if (resourceOwnerId !== actorUserId) {
    throw new NotFoundException(`${resourceName} not found`);
  }
}

/**
 * Helper gắn điều kiện lọc đồng thời theo id và ownerId vào SelectQueryBuilder.
 */
export function applyOwnerScope<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  ownerColumn: string,
  ownerId: string,
): SelectQueryBuilder<T> {
  return queryBuilder.andWhere(`${ownerColumn} = :ownerId`, { ownerId });
}
