import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkedAccountWithMetadata, PrivyClient, User } from '@privy-io/server-auth';
import * as dotenv from 'dotenv';
import { createViemAccount } from '@privy-io/server-auth/viem';
import AuthTokenService from './authToken.service';
import {
  Account,
  Chain,
  createPublicClient,
  createWalletClient,
  http,
  LocalAccount,
  PublicClient,
  WalletClient,
} from 'viem';
import * as viemChains from 'viem/chains';
import { SupportedChain } from '../utils/types';
import * as crypto from 'crypto'; 
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';

dotenv.config();

@Injectable()
export default class WalletClientService {
  private readonly privy: PrivyClient;
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
    optimism:viemChains.optimism
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
    [viemChains.optimism.id]: viemChains.optimism
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
    [viemChains.optimism.id]: process.env.INFURA_PROVIDER_OPTIMISM
  };

  constructor(
    private authTokenService: AuthTokenService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.redisClient = this.redisService.getOrThrow();

    const appId = this.configService.getOrThrow<string>('PRIVY_APP_ID');
    const appSecret = this.configService.getOrThrow<string>('PRIVY_APP_SECRET');

    this.privy = new PrivyClient(appId, appSecret, {
      walletApi: {
        authorizationPrivateKey: this.configService.getOrThrow<string>('PRIVY_AUTHORIZATION_PRIVATE_KEY'),
      },
    });
  }

  async verifyAndGetSolAddress(authToken: string) {
    const verifiedAuthToken = await this.authTokenService.verifyAuthToken(authToken);
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

  async createLocalAccount(authToken: string): Promise<Account> {
    try {
      const verifiedAuthToken =
        await this.authTokenService.verifyAuthToken(authToken);
      if (!verifiedAuthToken) {
        throw new Error('User is not verified.');
      }

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
  }: {
    authToken: string;
    chain?: SupportedChain;
    chainId?: number;
  }): Promise<WalletClient> {
    try {
      const hashedAuthToken = this.hashAuthToken(authToken);
      const cacheKey = `walletClient:${hashedAuthToken}`;
      const cachedData = await this.redisClient.get(cacheKey);

      let userId: string;
      if (cachedData) {
        const data = JSON.parse(cachedData);
        userId = data.userId;
      } else {
        const verifiedAuthToken =  await this.authTokenService.verifyAuthToken(authToken);
        
        if (!verifiedAuthToken) {
          throw new UnauthorizedException('User is not verified.');
        }

        userId = verifiedAuthToken.userId;
        await this.redisClient.set(cacheKey, JSON.stringify({userId}), 'EX', 60 * 60);
      }

      // console.log('userId: ', verifiedAuthToken.userId);

      const user: any = await this.privy.getUserById(userId);
      const privyEthereumAccount = user.linkedAccounts.find(
        (account) =>
          account.walletClientType === 'privy' &&
          account.connectorType === 'embedded' &&
          account.chainType === 'ethereum',
      );

      if(!privyEthereumAccount.delegated) {
        throw new BadRequestException('User has to delegate the actions for this privy account');
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
          throw new InternalServerErrorException('The chain you asked is not supported.');
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