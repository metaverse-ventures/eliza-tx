import { Module } from '@nestjs/common';
import { EvmTxService } from './evm-tx.service';
import { EvmTxController } from './evm-tx.controller';
import AuthTokenService from 'src/_common/service/authToken.service';
import WalletClientService from 'src/_common/service/walletClient.service';
import { PrismaService } from 'src/_common/service/prisma.service';

@Module({
  controllers: [EvmTxController],
  providers: [EvmTxService, AuthTokenService, WalletClientService, PrismaService],
})
export class EvmTxModule {}
