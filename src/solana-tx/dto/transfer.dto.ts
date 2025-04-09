import { IsString } from '@nestjs/class-validator';

export class TransferDTO {
  @IsString()
  fromChain: 'solana';

  @IsString()
  toAddress: string;

  @IsString()
  amount: string;

  @IsString()
  token: string;

  projectType: "Invoice" | "OTC" | "Seekers";
}
