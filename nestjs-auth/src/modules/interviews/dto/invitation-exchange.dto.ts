import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvitationExchangeDto {
  @ApiProperty({
    description: 'Raw token nhận từ email thư mời phỏng vấn',
    example: 'dGhpcy1pcy1hLXZhbGlkLWludml0YXRpb24tdG9rZW4',
  })
  @IsString({ message: 'token phải là chuỗi' })
  @IsNotEmpty({ message: 'token không được để trống' })
  token: string;
}
