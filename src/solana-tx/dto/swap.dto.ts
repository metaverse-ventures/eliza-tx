import { IsString, IsOptional } from '@nestjs/class-validator';

export class SwapDTO {
  @IsString()
  amount: string;

  @IsString()
  @IsOptional()
  tokenAddress: string;
}
