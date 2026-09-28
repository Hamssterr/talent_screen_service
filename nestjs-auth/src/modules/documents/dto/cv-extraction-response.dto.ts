import { ApiProperty } from '@nestjs/swagger';
import { CvExtractionStatus } from '../enums/cv-extraction-status.enum';
import { CvProfileStatus } from '../enums/cv-profile-status.enum';
import { CvProfileV1Dto } from '../schemas/cv-profile-v1.schema';

export class CvExtractionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  applicationId: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'nguyen_van_a_cv.pdf' })
  originalFilename: string;

  @ApiProperty({ example: 2, nullable: true })
  pageCount: number | null;

  @ApiProperty({
    enum: CvExtractionStatus,
    example: CvExtractionStatus.READY,
  })
  extractionStatus: CvExtractionStatus;

  @ApiProperty({
    description: 'Phiên bản xử lý extraction (tăng khi retry)',
    example: 1,
  })
  processingVersion: number;

  @ApiProperty({
    enum: CvProfileStatus,
    example: CvProfileStatus.DRAFT,
  })
  profileStatus: CvProfileStatus;

  @ApiProperty({
    description:
      'Phiên bản nội dung profile (tăng khi cập nhật hoặc extract thành công)',
    example: 2,
  })
  profileVersion: number;

  @ApiProperty({
    description: 'Dữ liệu hồ sơ ứng viên dạng JSON (profile.v1)',
    type: () => CvProfileV1Dto,
    nullable: true,
  })
  profileJson: CvProfileV1Dto | null;

  @ApiProperty({
    description: 'Mã lỗi chuẩn hóa nếu extraction không thành công',
    example: null,
    nullable: true,
  })
  errorCode: string | null;

  @ApiProperty({
    description:
      'Chỉ định xem request này có thể thực hiện retry qua endpoint retry-extraction hay không',
    example: false,
  })
  canRetry: boolean;

  @ApiProperty({ example: '2026-09-17T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-17T12:01:00.000Z' })
  updatedAt: Date;
}
