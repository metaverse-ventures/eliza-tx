import { Module, Global } from '@nestjs/common';
import { PrivyClient } from '@privy-io/server-auth';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: PrivyClient,
      useFactory: (configService: ConfigService) => {
        const appId = configService.get<string>('PRIVY_APP_ID');
        const appSecret = configService.get<string>('PRIVY_APP_SECRET');
        const authorizationPrivateKey = configService.get<string>(
          'PRIVY_AUTHORIZATION_PRIVATE_KEY',
        );

        if (!appId || !appSecret) {
          throw new Error(
            'Privy App ID and App Secret must be set in environment variables.',
          );
        }

        return new PrivyClient(appId, appSecret, {
          walletApi: {
            authorizationPrivateKey,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [PrivyClient],
})
export class PrivyModule {}
