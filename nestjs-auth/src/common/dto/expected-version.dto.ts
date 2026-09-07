import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConflictException } from '@nestjs/common';
import { ErrorCodes } from '../errors/error-codes';

export class ExpectedVersionDto {
  @Type(() => Number)
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;
}

export class VersionConflictException extends ConflictException {
  constructor(
    message = 'Dữ liệu đã bị thay đổi bởi thao tác khác (Version Conflict)',
  ) {
    super({
      code: ErrorCodes.VERSION_CONFLICT,
      message,
    });
  }
}
