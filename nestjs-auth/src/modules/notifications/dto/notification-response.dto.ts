import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiPropertyOptional()
  interviewId: string | null;

  @ApiPropertyOptional()
  invitationVersion: number | null;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  recipient: string;

  @ApiProperty({ enum: NotificationStatus })
  status: NotificationStatus;

  @ApiProperty()
  dedupeKey: string;

  @ApiPropertyOptional()
  providerMessageId: string | null;

  @ApiProperty()
  attempts: number;

  @ApiPropertyOptional()
  nextAttemptAt: Date | null;

  @ApiPropertyOptional()
  acceptedAt: Date | null;

  @ApiPropertyOptional()
  errorCode: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
