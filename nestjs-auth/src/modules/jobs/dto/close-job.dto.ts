import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CloseJobDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Job trước khi đóng (bắt buộc để chống race condition)',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;
}
