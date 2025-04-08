import { Module } from '@nestjs/common';
import { SolanaTxService } from './solana-tx.service';
import { SolanaTxController } from './solana-tx.controller';
import WalletClientService from 'src/_common/service/walletClient.service';
import AuthTokenService from 'src/_common/service/authToken.service';
import { PrivyConfig } from 'src/_common/service/privy.service';

@Module({
  controllers: [SolanaTxController],
  providers: [SolanaTxService, WalletClientService, AuthTokenService, PrivyConfig],
})
export class SolanaTxModule {}
