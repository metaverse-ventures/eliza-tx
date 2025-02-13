import { Address } from 'viem';
import { SupportedChain } from 'src/_common/utils/types';
import { IsBoolean, IsEthereumAddress, IsOptional, IsString, IsUUID ,} from '@nestjs/class-validator';

export class TransferDTO {

  @IsString()
  fromChain: SupportedChain;

  @IsEthereumAddress()
  toAddress: Address;

  @IsString()
  amount: string;

  @IsString()
  token: string;
}

export class BridgePayloadDTO {

  @IsString()
  fromChain: SupportedChain;

  @IsString()
  toChain: SupportedChain;

  @IsEthereumAddress()
  fromToken: Address;

  @IsEthereumAddress()
  toToken: Address;

  @IsString()
  amount: string;

  @IsOptional()
  @IsEthereumAddress()
  toAddress?: Address;

  @IsOptional()
  @IsUUID()
  roomId:string

  @IsBoolean()
  fuel: boolean = false;
}
