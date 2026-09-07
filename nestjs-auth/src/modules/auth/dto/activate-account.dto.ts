import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateAccountDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}
