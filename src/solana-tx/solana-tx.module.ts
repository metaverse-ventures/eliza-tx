import { Module } from '@nestjs/common';
import { SolanaTxService } from './solana-tx.service';
import { SolanaTxController } from './solana-tx.controller';
import WalletClientService from 'src/_common/service/walletClient.service';
import AuthTokenService from 'src/_common/service/authToken.service';

@Module({
  controllers: [SolanaTxController],
  providers: [SolanaTxService, WalletClientService, AuthTokenService],
})
export class SolanaTxModule {}
