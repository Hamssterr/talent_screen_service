import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class ExtractCvProfileDto {
  @ApiProperty({
    description:
      'Phiên bản xử lý dự kiến (optimistic concurrency). Bắt đầu từ 1 cho bản upload ban đầu.',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedProcessingVersion phải là số nguyên' })
  @Min(1, { message: 'expectedProcessingVersion tối thiểu là 1' })
  expectedProcessingVersion: number;
}
