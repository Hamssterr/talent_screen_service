import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { QuestionSetItemInputDto } from './question-set-item-input.dto';

export class UpdateQuestionSetItemsDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Question Set để kiểm tra optimistic lock (OCC)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;

  @ApiProperty({
    description: 'Danh sách các câu hỏi thay thế toàn bộ (từ 1 đến 12 câu)',
    type: [QuestionSetItemInputDto],
  })
  @IsArray({ message: 'items phải là mảng' })
  @ArrayMinSize(1, { message: 'items phải có ít nhất 1 câu hỏi' })
  @ArrayMaxSize(12, { message: 'items tối đa là 12 câu hỏi' })
  @ValidateNested({ each: true })
  @Type(() => QuestionSetItemInputDto)
  items: QuestionSetItemInputDto[];
}
