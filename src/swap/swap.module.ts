import { Module } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import AuthTokenService from 'src/_common/service/authToken.service';
import WalletClientService from 'src/_common/service/walletClient.service';

@Module({
  controllers: [SwapController],
  providers: [SwapService,  WalletClientService, AuthTokenService],
})
export class SwapModule {}
