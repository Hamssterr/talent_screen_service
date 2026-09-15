import { IsBoolean } from 'class-validator';

export class FinishSessionDto {
  @IsBoolean({ message: 'confirmEarlyFinish phải là kiểu boolean' })
  confirmEarlyFinish: boolean;
}
