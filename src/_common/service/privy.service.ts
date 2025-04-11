import { PrivyClient } from '@privy-io/server-auth';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProjectType = 'Invoice' | 'OTC' | 'Seekers';

@Injectable()
export class PrivyConfig {
  constructor(private configService: ConfigService) {}

  initializePrivyClient(projectType: ProjectType): PrivyClient {
    const appIdKey = `PRIVY_APP_ID_${projectType.toUpperCase()}`;
    const appSecretKey = `PRIVY_APP_SECRET_${projectType.toUpperCase()}`;
    const authKeyKey = `PRIVY_AUTHORIZATION_PRIVATE_KEY_${projectType.toUpperCase()}`;

    const appId = this.configService.getOrThrow<string>(appIdKey);
    const appSecret = this.configService.getOrThrow<string>(appSecretKey);
    const authorizationPrivateKey = this.configService.getOrThrow<string>(authKeyKey);

    return new PrivyClient(appId, appSecret, {
      walletApi: {
        authorizationPrivateKey,
      },
    });
  }
}