import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SubmitAnswerDto {
  @IsUUID('4', { message: 'turnId phải là UUID v4 hợp lệ' })
  @IsNotEmpty({ message: 'turnId không được để trống' })
  turnId: string;

  @IsOptional()
  @IsString({ message: 'text phải là chuỗi ký tự' })
  @MaxLength(10000, { message: 'text không được vượt quá 10,000 ký tự' })
  text?: string | null;

  @IsBoolean({ message: 'isSkipped phải là kiểu boolean' })
  isSkipped: boolean;
}
