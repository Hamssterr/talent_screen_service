import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class StartInterviewDto {
  @IsBoolean({ message: 'consentAccepted phải là kiểu boolean' })
  consentAccepted: boolean;

  @IsString({ message: 'consentVersion phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'consentVersion không được để trống' })
  consentVersion: string;
}
