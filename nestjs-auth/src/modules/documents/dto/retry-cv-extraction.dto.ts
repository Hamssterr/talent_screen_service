import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class RetryCvExtractionDto {
  @ApiProperty({
    description:
      'Phiên bản xử lý hiện tại của CV version cần retry (optimistic concurrency)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedProcessingVersion phải là số nguyên' })
  @Min(1, { message: 'expectedProcessingVersion tối thiểu là 1' })
  expectedProcessingVersion: number;
}
