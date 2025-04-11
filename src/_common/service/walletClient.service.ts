import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/server-auth';
import * as dotenv from 'dotenv';
import { createViemAccount } from '@privy-io/server-auth/viem';
import AuthTokenService from './authToken.service';
import {
  Account,
  Chain,
  createPublicClient,
  createWalletClient,
  http,
  WalletClient,
} from 'viem';
import * as viemChains from 'viem/chains';
import { SupportedChain } from '../utils/types';
import * as crypto from 'crypto';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { PrivyConfig, ProjectType } from './privy.service';

dotenv.config();

@Injectable()
export default class WalletClientService {
  private privy: PrivyClient;
  private readonly redisClient: Redis;

  chains: Record<string, Chain> = {
    ethereum: viemChains.mainnet,
    sepolia: viemChains.sepolia,
    bsc: viemChains.bsc,
    bscTestnet: viemChains.bscTestnet,
    base: viemChains.base,
    baseSepolia: viemChains.baseSepolia,
    polygon: viemChains.polygon,
    gnosis: viemChains.gnosis,
    arbitrum: viemChains.arbitrum,
    optimism: viemChains.optimism,
  };

  private chainFromChainId: Record<number, Chain> = {
    [viemChains.mainnet.id]: viemChains.mainnet,
    [viemChains.polygon.id]: viemChains.polygon,
    [viemChains.bsc.id]: viemChains.bsc,
    [viemChains.sepolia.id]: viemChains.sepolia,
    [viemChains.bscTestnet.id]: viemChains.bscTestnet,
    [viemChains.base.id]: viemChains.base,
    [viemChains.baseSepolia.id]: viemChains.baseSepolia,
    [viemChains.arbitrum.id]: viemChains.arbitrum,
    [viemChains.gnosis.id]: viemChains.gnosis,
    [viemChains.optimism.id]: viemChains.optimism,
  };

  private providers: Record<number, string> = {
    [viemChains.mainnet.id]: process.env.INFURA_PROVIDER_MAINNET,
    [viemChains.polygon.id]: process.env.INFURA_PROVIDER_POLYGON,
    [viemChains.bsc.id]: process.env.INFURA_PROVIDER_BSC,
    [viemChains.sepolia.id]: process.env.INFURA_PROVIDER_SEPOLIA,
    [viemChains.gnosis.id]: process.env.INFURA_PROVIDER_GNOSIS,
    [viemChains.base.id]: process.env.INFURA_PROVIDER_BASE,
    [viemChains.baseSepolia.id]: process.env.INFURA_PROVIDER_BASE_SEPOLIA,
    [viemChains.bscTestnet.id]: process.env.INFURA_PROVIDER_BSC_TESTNET,
    [viemChains.arbitrum.id]: process.env.INFURA_PROVIDER_ARBITRUM,
    [viemChains.optimism.id]: process.env.INFURA_PROVIDER_OPTIMISM,
  };

  constructor(
    private authTokenService: AuthTokenService,
    private redisService: RedisService,
    private configService: ConfigService,
    private privyConfig: PrivyConfig,
  ) {
    this.redisClient = this.redisService.getOrThrow();
  }

  async verifyAndGetSolAddress(authToken: string, projectType: ProjectType) {
    const verifiedAuthToken =
      await this.authTokenService.verifyAuthToken(authToken, projectType);
      this.privy = await this.privyConfig.initializePrivyClient(projectType);

    // const user: User = await this.privy.getUserById(verifiedAuthToken.userId);
    const user: any = await this.privy.getUserById(verifiedAuthToken.userId);

    const privySolanaAccount = user.linkedAccounts.find(
      (account) =>
        account.walletClientType === 'privy' &&
        account.connectorType === 'embedded' &&
        account.chainType === 'solana',
    );
    const privySolanaAddress = privySolanaAccount.address;
    if (privySolanaAddress) {
      console.log('Privy Solana Address:', privySolanaAddress);
    } else {
      console.log('No linked account matches the criteria.');
    }

    return privySolanaAddress;
  }

  async createLocalAccount(authToken: string, projectType: ProjectType): Promise<Account> {
    try {
      const verifiedAuthToken =
        await this.authTokenService.verifyAuthToken(authToken, projectType);
      if (!verifiedAuthToken) {
        throw new Error('User is not verified.');
      }
      this.privy = this.privyConfig.initializePrivyClient(projectType);

      const user: any = await this.privy.getUserById(verifiedAuthToken.userId);
      const privyEthereumAccount = user.linkedAccounts.find(
        (account) =>
          account.walletClientType === 'privy' &&
          account.connectorType === 'embedded' &&
          account.chainType === 'ethereum',
      );
      const privyEthereumAddress = privyEthereumAccount.address;
      if (privyEthereumAddress) {
        console.log('Privy Ethereum Address:', privyEthereumAddress);
      } else {
        console.log('No linked account matches the criteria.');
      }

      const account: Account = await createViemAccount({
        walletId: user.id,
        address: privyEthereumAddress,
        privy: this.privy,
      });
      return account;
    } catch (error) {
      console.error(
        `Local account creation failed with error: ${error.message}`,
      );
      throw error;
    }
  }

  async getChainFromId(chainId: number): Promise<Chain> | undefined {
    return this.chainFromChainId[chainId];
  }

  async getProviderFromChainId(chainId: number): Promise<string> | undefined {
    return this.providers[chainId];
  }

  async createPublicClient(chainId: number) {
    try {
      const chain = await this.getChainFromId(chainId);
      const provider = await this.getProviderFromChainId(chainId);

      const publicClient = createPublicClient({
        chain: chain,
        transport: http(provider),
      });

      if (!publicClient) {
        throw new InternalServerErrorException('Public Client not initialized');
      }

      return publicClient;
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private hashAuthToken(authToken: string): string {
    const secretKey = this.configService.getOrThrow<string>('HASH_SECRET_KEY');
    return crypto
      .createHmac('sha256', secretKey)
      .update(authToken)
      .digest('hex');
  }

  async createWalletClient({
    authToken,
    chain,
    chainId,
    projectType,
  }: {
    authToken: string;
    chain?: SupportedChain;
    chainId?: number;
    projectType: ProjectType;
  }): Promise<WalletClient> {
    try {

      this.privy = this.privyConfig.initializePrivyClient(projectType);

      const hashedAuthToken = this.hashAuthToken(authToken);
      const cacheKey = `walletClient:${hashedAuthToken}`;
      const cachedData = await this.redisClient.get(cacheKey);

      let userId: string;
      if (cachedData) {
        const data = JSON.parse(cachedData);
        userId = data.userId;
      } else {
        const verifiedAuthToken =
          await this.authTokenService.verifyAuthToken(authToken, projectType);

        if (!verifiedAuthToken) {
          throw new UnauthorizedException('User is not verified.');
        }

        userId = verifiedAuthToken.userId;
        await this.redisClient.set(
          cacheKey,
          JSON.stringify({ userId }),
          'EX',
          60 * 60,
        );
      }

      // console.log('userId: ', verifiedAuthToken.userId);

      const user: any = await this.privy.getUserById(userId);
      const privyEthereumAccount = user.linkedAccounts.find(
        (account) =>
          account.walletClientType === 'privy' &&
          account.connectorType === 'embedded' &&
          account.chainType === 'ethereum',
      );

      if (!privyEthereumAccount.delegated) {
        throw new BadRequestException(
          'User has to delegate the actions for this privy account',
        );
      }

      const privyEthereumAddress = privyEthereumAccount.address;

      if (privyEthereumAddress) {
        console.log('Privy Ethereum Address:', privyEthereumAddress);
      } else {
        console.log('No linked account matches the criteria.');
      }

      const account = await createViemAccount({
        walletId: user.id,
        address: privyEthereumAddress,
        privy: this.privy,
      });

      let selectedChain;

      if (chain) {
        selectedChain = this.chains[chain];

        if (!selectedChain) {
          throw new InternalServerErrorException(
            'The chain you asked is not supported.',
          );
        }
      } else if (chainId) {
        selectedChain = await this.getChainFromId(chainId);
      }

      const provider = await this.getProviderFromChainId(selectedChain.id);

      const client: WalletClient = createWalletClient({
        account: account as Account, // `Account` instance from above
        chain: selectedChain, // Replace with your desired network
        transport: http(provider),
      });

      if (!client) {
        throw new InternalServerErrorException('Wallet Client not initialized');
      }
      return client;
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
