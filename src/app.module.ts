import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EvmTxModule } from './evm-tx/evm-tx.module';
import { AccessTokenMiddleware } from './_common/middleware/accessToken.middleware';
import { EvmTxController } from './evm-tx/evm-tx.controller';
// import { ScheduleService } from './_common/service/schedule.service';
// import { ScheduleModule } from '@nestjs/schedule';
// import { PrismaService } from './_common/service/prisma.service';
import { SolanaTxModule } from './solana-tx/solana-tx.module';
import WalletClientService from './_common/service/walletClient.service';
import AuthTokenService from './_common/service/authToken.service';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { SolanaTxController } from './solana-tx/solana-tx.controller';
// import { PrivyModule } from './_common/module/privy.module';
import { SwapModule } from './swap/swap.module';
import { SwapController } from './swap/swap.controller';
import { PrivyConfig } from './_common/service/privy.service';

@Module({
  imports: [
    EvmTxModule,
    // PrivyModule,
    // ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        config: {
          host: configService.get<string>('REDIS_HOST'),
          port: parseInt(configService.get<string>('REDIS_PORT')),
          password: configService.get<string>('REDIS_PWD'),
        },
      }),
      inject: [ConfigService],
    }),
    SolanaTxModule,
    SwapModule,
  ],
  controllers: [AppController],
  providers: [AppService, WalletClientService, AuthTokenService, PrivyConfig],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AccessTokenMiddleware)
      .forRoutes(EvmTxController, SolanaTxController, SwapController);
  }
}
