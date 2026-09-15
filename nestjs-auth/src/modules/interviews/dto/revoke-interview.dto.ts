import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeInterviewDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Interview để kiểm soát optimistic lock (OCC)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;

  @ApiProperty({
    description: 'Lý do thu hồi lời mời phỏng vấn',
    example: 'Kế hoạch tuyển dụng thay đổi',
    minLength: 1,
    maxLength: 500,
  })
  @IsString({ message: 'reason phải là chuỗi' })
  @IsNotEmpty({ message: 'reason không được để trống' })
  @Length(1, 500, { message: 'reason từ 1 đến 500 ký tự' })
  reason: string;

  @ApiPropertyOptional({
    description: 'Gửi email thông báo hủy lời mời cho Candidate hay không',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'notifyCandidate phải là boolean' })
  notifyCandidate?: boolean = false;
}
