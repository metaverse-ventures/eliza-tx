import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenClaims } from '@privy-io/server-auth';
import { PrivyConfig, ProjectType } from './privy.service';


@Injectable()
export default class AuthTokenService {
  private privy;

  constructor(private configService: ConfigService, private privyConfig: PrivyConfig) { }

  async verifyAuthToken(authToken: string, projectType: ProjectType): Promise<AuthTokenClaims> {
    try {
      this.privy = this.privyConfig.initializePrivyClient(projectType);
      const verificationKey = this.configService.getOrThrow<string>(
        `PRIVY_APP_VERIFICATION_KEY_${projectType.toUpperCase()}`,
      );
      const verifiedClaims = await this.privy.verifyAuthToken(authToken, verificationKey);
      return verifiedClaims;
    } catch (error) {
      throw new InternalServerErrorException(
        `Token verification failed with error: ${error.message}`,
      );
    }
  }
}
