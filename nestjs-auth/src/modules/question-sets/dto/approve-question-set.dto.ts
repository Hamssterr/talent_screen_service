import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveQuestionSetDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Question Set để kiểm tra optimistic lock (OCC)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;
}
