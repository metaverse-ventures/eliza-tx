import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenClaims, PrivyClient } from '@privy-io/server-auth';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export default class AuthTokenService {
  private readonly privy: PrivyClient;
  constructor(
    private configService: ConfigService,
  ) {
    const appId = this.configService.getOrThrow<string>('PRIVY_APP_ID');
    const appSecret = this.configService.getOrThrow<string>('PRIVY_APP_SECRET');

    this.privy = new PrivyClient(appId, appSecret, {
      walletApi: {
        authorizationPrivateKey: this.configService.getOrThrow<string>('PRIVY_AUTHORIZATION_PRIVATE_KEY'),
      },
    })
  }

  async verifyAuthToken(authToken: string): Promise<AuthTokenClaims> {
    try {   
      const verifiedClaims = await this.privy.verifyAuthToken(
        authToken
      );    
      return verifiedClaims;
    } catch (error) {
      throw new InternalServerErrorException(`Token verification failed with error: ${error.message}`);
    }
  }
}
