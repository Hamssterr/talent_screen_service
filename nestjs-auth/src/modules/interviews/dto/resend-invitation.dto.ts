import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResendInvitationDto {
  @ApiProperty({
    description:
      'Phiên bản hiện tại của Interview để kiểm soát optimistic lock (OCC)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion tối thiểu là 1' })
  expectedVersion: number;

  @ApiPropertyOptional({
    description:
      'Thời hạn mới cho lời mời phỏng vấn (tùy chọn, từ 1 đến 14 ngày tới)',
    example: '2026-09-20T23:59:59+07:00',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'invitationExpiresAt phải là định dạng ISO-8601' },
  )
  invitationExpiresAt?: string;
}
