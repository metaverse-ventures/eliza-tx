import { Module } from '@nestjs/common';
import { EvmTxService } from './evm-tx.service';
import { EvmTxController } from './evm-tx.controller';
import AuthTokenService from 'src/_common/service/authToken.service';
import WalletClientService from 'src/_common/service/walletClient.service';
import { PrivyConfig } from 'src/_common/service/privy.service';

@Module({
  controllers: [EvmTxController],
  providers: [EvmTxService, AuthTokenService, WalletClientService, PrivyConfig],
})
export class EvmTxModule {}
