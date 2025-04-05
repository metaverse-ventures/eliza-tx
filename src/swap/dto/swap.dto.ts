import { IsString } from '@nestjs/class-validator';
import { SupportedChain } from 'src/_common/utils/types';

export class SwapPayloadDTO {
  @IsString()
  inputToken: string;

  @IsString()
  outputToken: string;

  @IsString()
  amount: string;

  @IsString()
  chain: SupportedChain;
}
