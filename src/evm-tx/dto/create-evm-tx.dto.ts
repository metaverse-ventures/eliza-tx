import { Address } from 'viem';
import { SupportedChain } from 'src/_common/utils/types';
import {
  IsEthereumAddress,
  IsOptional,
  IsString,
} from '@nestjs/class-validator';

export class TransferDTO {
  @IsString()
  fromChain: SupportedChain;

  @IsEthereumAddress()
  toAddress: Address;

  @IsString()
  amount: string;

  @IsString()
  token: string;

  projectType: "Invoice" | "OTC" | "Seekers";
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

  // @IsBoolean()
  // fuel: boolean = false;

  projectType: "Invoice" | "OTC" | "Seekers";

}
