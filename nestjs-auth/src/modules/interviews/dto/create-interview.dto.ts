import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInterviewDto {
  @ApiProperty({
    description: 'UUID của Question Set đã được phê duyệt gắn với Application',
    example: '11111111-1111-4000-8000-111111111111',
  })
  @IsUUID('4', { message: 'questionSetId phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'questionSetId không được để trống' })
  questionSetId: string;

  @ApiProperty({
    description:
      'Thời điểm hết hạn của lời mời phỏng vấn (từ 1 đến 14 ngày tới)',
    example: '2026-09-17T23:59:59+07:00',
  })
  @IsDateString(
    {},
    { message: 'invitationExpiresAt phải là định dạng ISO-8601' },
  )
  @IsNotEmpty({ message: 'invitationExpiresAt không được để trống' })
  invitationExpiresAt: string;

  @ApiProperty({
    description:
      'Thời lượng làm bài sau khi ứng viên nhấn Bắt đầu (từ 10 đến 90 phút)',
    example: 30,
    minimum: 10,
    maximum: 90,
  })
  @IsInt({ message: 'durationMinutes phải là số nguyên' })
  @Min(10, { message: 'durationMinutes tối thiểu là 10 phút' })
  @Max(90, { message: 'durationMinutes tối đa là 90 phút' })
  durationMinutes: number;

  @ApiProperty({
    description:
      'Tổng số câu hỏi đào sâu/follow-up tối đa cho toàn bộ buổi phỏng vấn',
    example: 4,
    minimum: 0,
  })
  @IsInt({ message: 'maxFollowUpsTotal phải là số nguyên' })
  @Min(0, { message: 'maxFollowUpsTotal tối thiểu là 0' })
  maxFollowUpsTotal: number;

  @ApiProperty({
    description:
      'Phiên bản Application kỳ vọng để kiểm soát optimistic lock (OCC)',
    example: 3,
    minimum: 1,
  })
  @IsInt({ message: 'expectedApplicationVersion phải là số nguyên' })
  @Min(1, { message: 'expectedApplicationVersion tối thiểu là 1' })
  expectedApplicationVersion: number;
}
