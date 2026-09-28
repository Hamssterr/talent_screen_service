import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RetryQuestionGenerationDto {
  @ApiProperty({
    description:
      'Phiên bản generationVersion hiện tại mong muốn để đảm bảo Optimistic Concurrency Control',
    example: 1,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'expectedGenerationVersion không được để trống' })
  @IsInt({ message: 'expectedGenerationVersion phải là số nguyên' })
  @Min(1, { message: 'expectedGenerationVersion tối thiểu là 1' })
  expectedGenerationVersion: number;
}
