import { Injectable } from '@nestjs/common';
import {
  BridgePayloadDTO,
  TransferDTO,
} from './dto/create-evm-tx.dto';
import {
  PrivyClient,
} from '@privy-io/server-auth';
import WalletClientService from 'src/_common/service/walletClient.service';
import {
  ChainType,
  createConfig,
  ExtendedChain,
  getRoutes,
  getTokens,
  ChainType,
  getToken,
  getStepTransaction,
  getStatus,
  getTokenAllowance,
  getGasRecommendation,
  RoutesResponse,
  getTokenBalance
} from '@lifi/sdk';
import {
  encodeFunctionData,
  formatEther,
  Hash,
  parseEther,
  parseUnits,
  PublicClient,
  TransactionReceipt,
  WalletClient,
  zeroAddress,
} from 'viem';
import { approvalABI, transferABI } from 'src/_common/helper/abi';
import { Transaction } from 'src/_common/utils/interface';
import { PrismaService } from 'src/_common/service/prisma.service';
import { ConfigService } from '@nestjs/config';
import { response } from 'src/_common/helper/response';

@Injectable()
export class EvmTxService {
  private readonly privy: PrivyClient;

  constructor(
    private walletClientService: WalletClientService,
    // private prismaService: PrismaService,
    private configService: ConfigService
  ) {
    const appId = this.configService.getOrThrow<string>('PRIVY_APP_ID');
    const appSecret = this.configService.getOrThrow<string>('PRIVY_APP_SECRET');

    this.privy = new PrivyClient(appId, appSecret, {
      walletApi: {
        authorizationPrivateKey: this.configService.getOrThrow<string>('PRIVY_AUTHORIZATION_PRIVATE_KEY'),
      },
    });
  }

  async getTokenList(chainId: number) {
    try {
      const tokens = await getTokens({
        chains: [chainId],
        chainTypes: [ChainType.EVM, ChainType.SVM],
      });
      // console.log('tokens:', tokens.tokens[chainId]);
      return tokens.tokens[chainId];
    } catch (error) {
      console.error(error);
    }
  }

  async getTokenAddress(tokenSymbol: string, chainId: number): Promise<string> {
    const token = await getToken(chainId, tokenSymbol);
    const tokenDec = token.decimals;
    const tokenAddress = token?.address;
    return tokenAddress;
  }

  async getTokenDec(tokenSymbol: string, chainId: number): Promise<number> {
    const token = await getToken(chainId, tokenSymbol);
    const tokenDec = token.decimals;
    return tokenDec;
  }

  private async waitForConfirmation(
    publicClient: PublicClient,
    hash: Hash,
    retries = 360,
    interval = 5000,
  ): Promise<TransactionReceipt> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Check transaction receipt to see if it's mined
        const receipt: TransactionReceipt =
          await publicClient.getTransactionReceipt({
            hash: hash,
          });
        if (receipt && receipt.status === 'success') {
          console.log(`Transaction ${hash} confirmed.`);
          return receipt; // Transaction is confirmed
        }
      } catch (error) {
        console.error(
          `Error fetching transaction receipt: ${error.message}`,
        );
      }

      console.log(
        `Waiting for transaction ${hash} to be confirmed... Attempt ${attempt}/${retries}`,
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(
      `Transaction ${hash} was not confirmed after ${retries} retries.`,
    );
  }


  async transfer(
    TransferPayload: TransferDTO,
    authToken: string,
  ) {
    let nativeTransfer: boolean = null;
    if (TransferPayload.token) {
      nativeTransfer = false;
    }
    const walletClient: WalletClient =
      await this.walletClientService.createWalletClient({
        authToken,
        chain: TransferPayload.fromChain,
      });
    const fromChain =
      this.walletClientService.chains[TransferPayload.fromChain];

    const publicClient = await this.walletClientService.createPublicClient(
      fromChain.id,
    );
    console.log('nativeTransfer: ', nativeTransfer);

    if (!nativeTransfer) {
      try {

        const erc20TokenAddress = await this.getTokenAddress(
          TransferPayload.token,
          fromChain.id,
        );
        const tokenDecimals = await this.getTokenDec(
          TransferPayload.token,
          fromChain.id,
        )
        const transferAmount = parseUnits(TransferPayload.amount, tokenDecimals);
        const inputToken = await getToken(fromChain.id, erc20TokenAddress);
        const tokenBalance = await getTokenBalance(walletClient.account.address, inputToken);
        if (parseInt(tokenBalance.amount.toString()) < parseInt(transferAmount.toString())) {
          return response('FAILED', `Insufficient balance. Your balance is ${formatEther(tokenBalance.amount)}. Please fund your account and try again.`);
        }
        const encodedData = encodeFunctionData({
          abi: transferABI,
          // functionName: 'transfer',
          args: [TransferPayload.toAddress.toLowerCase(), transferAmount],
        });

        const transaction = {
          to: erc20TokenAddress, // Set the token contract address
          data: encodedData, // Encoded transfer data
          value: '0x0', // No MATIC is sent
          chainId: fromChain.id,
        };

        // Send the transaction
        const data: any = await this.privy.walletApi.ethereum.sendTransaction({
          address: walletClient.account.address.toLowerCase(),
          chainType: 'ethereum',
          caip2: `eip155:${fromChain.id}`,
          transaction,
        });

        await this.waitForConfirmation(
          publicClient as PublicClient,
          data.hash as Hash,
        );
        console.log(data.hash);
        return response('SUCCESS', `Transfer Transaction successful. Hash: ${data.hash as Hash}`);
      } catch (error) { }
    } else {
      try {
        const ethValue = parseEther(TransferPayload.amount);
        const value = parseInt(ethValue.toString());

        const nativeBalance = await publicClient.getBalance({
          address: walletClient.account.address,
        })
        console.log('Native balance:', nativeBalance);
        if (nativeBalance < ethValue) {
          return response('FAILED', `Insufficient balance. Your balance is ${formatEther(nativeBalance)}. Please fund your account and try again.`);
        }

        const data: any = await this.privy.walletApi.ethereum.sendTransaction({
          address: walletClient.account.address.toLowerCase(),
          chainType: 'ethereum',
          caip2: `eip155:${fromChain.id}`,
          transaction: {
            to: TransferPayload.toAddress.toLowerCase(),
            value,
            chainId: fromChain.id,
          },
        });

        await this.waitForConfirmation(
          publicClient as PublicClient,
          data.hash as Hash,
        )
        console.log('hash: ', data.hash);
        return response('SUCCESS', `Transfer Transaction successful. Hash: ${data.hash as Hash}`);

      } catch (error) {
        console.error('Error sending transaction:', error);
      }
    }
  }
  catch(error) {
    throw new Error(`Transfer failed: ${error.message}`);
  }

  async getGasSuggestion(toChainId: number, fromToken: string, fromChainId: number) {
    try {
      const gasSuggestion = await getGasRecommendation({
        chainId: toChainId,
        fromToken: fromToken,
        fromChain: fromChainId,
      });
      console.log('gasSuggestion:', gasSuggestion);
      return gasSuggestion;
    } catch (error) {
      console.error(error);
    }
  }


  async bridge(
    BridgePayloadDTO: BridgePayloadDTO,
    authToken: string,
  ) {
    const walletClient = await this.walletClientService.createWalletClient({
      authToken: authToken,
      chain: BridgePayloadDTO.fromChain,
    });

    createConfig({
      integrator: 'eliza',
      chains: Object.values(this.walletClientService.chains).map((config) => ({
        id: config.id,
        name: config.name,
        key: config.name.toLowerCase(),
        chainType: 'EVM',
        nativeToken: {
          ...config.nativeCurrency,
          chainId: config.id,
          address: '0x0000000000000000000000000000000000000000',
          coinKey: config.nativeCurrency.symbol,
        },
        metamask: {
          chainId: `0x${config.id.toString(16)}`,
          chainName: config.name,
          nativeCurrency: config.nativeCurrency,
          rpcUrls: [config.rpcUrls.default.http[0]],
          blockExplorerUrls: [config.blockExplorers.default.url],
        },
        diamondAddress: '0x0000000000000000000000000000000000000000',
        coin: config.nativeCurrency.symbol,
        mainnet: true,
      })) as ExtendedChain[],
      // providers: [evmProvider],
    });

    const toChainId = this.walletClientService.chains[BridgePayloadDTO.toChain].id;
    const fromChainId = this.walletClientService.chains[BridgePayloadDTO.fromChain].id;

    const tokenDec = await this.getTokenDec(BridgePayloadDTO.fromToken, fromChainId);

    const fromAmount = parseUnits(BridgePayloadDTO.amount, tokenDec);
    const fromAmountString = fromAmount.toString();

    const fromChainPublicClient = await this.walletClientService.createPublicClient(fromChainId);
    // const toChainPublicClient = await this.walletClientService.createPublicClient(toChainId);
    let routes: RoutesResponse;

    // if (BridgePayloadDTO.fuel) {
    //   const gasSuggestion = await this.getGasSuggestion(toChainId, BridgePayloadDTO.fromToken, fromChainId)
    //   const fromAmountForGas = gasSuggestion?.available ? gasSuggestion?.fromAmount : undefined

    //   routes = await getRoutes({
    //     fromTokenAddress: BridgePayloadDTO.fromToken,
    //     toTokenAddress: BridgePayloadDTO.toToken ? BridgePayloadDTO.toToken : BridgePayloadDTO.fromToken,
    //     fromChainId: fromChainId,
    //     toChainId: toChainId,
    //     fromAmount: fromAmountString,
    //     fromAddress: walletClient.account.address,
    //     toAddress: BridgePayloadDTO.toAddress || walletClient.account.address,
    //     fromAmountForGas: fromAmountForGas,
    //   });

    //   if (!routes.routes.length) {
    //     console.log('No routes found. Please try again with a different token / chain combination.');
    //     return response("FAILED", `No routes for this token combination found. Please try again with a different token / chain combination.`)
    //   }

    // } else {
      routes = await getRoutes({
        fromTokenAddress: BridgePayloadDTO.fromToken,
        toTokenAddress: BridgePayloadDTO.toToken ? BridgePayloadDTO.toToken : BridgePayloadDTO.fromToken,
        fromChainId: fromChainId,
        toChainId: toChainId,
        fromAmount: fromAmountString,
        fromAddress: walletClient.account.address,
        toAddress: BridgePayloadDTO.toAddress || walletClient.account.address,
      });

      if (!routes.routes.length) {
        console.log('No routes found. Please try again with a different token / chain combination.');
        return response("FAILED", `No routes for this token combination found. Please try again with a different token / chain combination.`)
      }

      const stepLength = routes.routes[0].steps.length;

      if (stepLength > 1) {
        // check the native balance of the wallet address on the toChainId
        // const txStep = await getStepTransaction(routes.routes[0].steps[1])

        // const toChainNativeBalance = await toChainPublicClient.getBalance({
        //   address: walletClient.account.address,
        // });

        // if (parseInt(toChainNativeBalance.toString()) <= parseInt(txStep.estimate.gasCosts[0].amount)) {
        //   console.log(`It seems that this route has multiple steps and you don't have enough balance on the destination chain to fulfill the second step. Please fund your wallet on the desination chain and retry`)
        //   return response("FAILED", `It seems that this route has multiple steps and you don't have enough balance on the destination chain to fulfill the second step. Please fund your wallet on the desination chain and retry`)
        // }

        console.log(`Currently there are no efficient or optimal routes available for bridging the selected tokens between these chains. Please try again later to get the best possible rates and routes.`)
        return response("FAILED", `Currently there are no efficient or optimal routes available for bridging the selected tokens between these chains. Please try again later to get the best possible rates and routes.`)

      }
    // }

    // check the number of steps in the route
    // const stepLength = routes.routes[0].steps.length;
    // console.log('routes steps length:', stepLength);


    const txStep = await getStepTransaction(routes.routes[0].steps[0]);

    const fromNativeBalance = await fromChainPublicClient.getBalance({
      address: walletClient.account.address,
    });

    const tokenAddress = await this.getTokenAddress(BridgePayloadDTO.fromToken, fromChainId)
    console.log({ tokenAddress })
    if (tokenAddress !== zeroAddress) {

      const approvalAmount = txStep.estimate.fromAmount;
      const approvalAddress = txStep.estimate.approvalAddress;
      const data = encodeFunctionData({
        abi: approvalABI,
        functionName: 'approve',
        args: [approvalAddress, approvalAmount],
      });

      const gas = await fromChainPublicClient.estimateGas({
        data,
        account: walletClient.account.address,
        to: txStep.action.fromToken.address,
      })

      console.log({ fromNativeBalance, gas })

      // Check if native balance is less than estimated gas
      if (fromNativeBalance < gas) {
        console.error('Native balance is less than estimated gas. Transaction cannot proceed.');
        return response("FAILED", `Not enough gas in your wallet to fund the transaction. Please fund your wallet with enough gas native tokens to perform the transactions.`)
      }

      const transactionParam = {
        to: txStep.action.fromToken.address,
        chainId: fromChainId,
        data: data,
      };

      const approved: any = await this.privy.walletApi.ethereum.sendTransaction({
        address: walletClient.account.address.toLowerCase(),
        chainType: 'ethereum',
        caip2: `eip155:${fromChainId}`,
        transaction: transactionParam,
      });
      console.log({ Apporvalhash: approved.hash });

      await this.waitForConfirmation(
        fromChainPublicClient as PublicClient,
        approved.hash as Hash,
      );

    }

    const transactionRequestWithParams = {
      address: walletClient.account.address.toLowerCase(),
      chainType: 'ethereum',
      caip2: `eip155:${fromChainId}`,
      transaction: txStep.transactionRequest,
    };
    const transactionHash: any =
      await this.privy.walletApi.ethereum.sendTransaction(
        transactionRequestWithParams,
      );

    await this.waitForConfirmation(
      fromChainPublicClient as PublicClient,
      transactionHash.hash as Hash,
    );


    // if (stepLength > 1) {
    //   const secondStep = await getStepTransaction(routes.routes[0].steps[1]);
    //   const firstTxnEstTime = new Date().getTime() + txStep.estimate.executionDuration * 1000;
    //   const firstTxEstDateTime = new Date(firstTxnEstTime).toISOString();

    //   const secondTxn = await this.prismaService.txnData.create(
    //     {
    //       data: {
    //         firstTxnEstTime: firstTxEstDateTime,
    //         firstTxnHash: transactionHash.hash,
    //         firstTxnStatus: TxnStatus.PENDING,
    //         secondTxnData: secondStep.transactionRequest,
    //         secondStepApprovalAddress: secondStep.action.fromToken.address,
    //         secondStepApprovalAmount: secondStep.estimate.fromAmount,
    //         privyWalletAddress: walletClient.account.address
    //       }
    //     }
    //   )

    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   const result = await getStatus({
    //     txHash: transactionHash.hash,
    //   });


    //   return response("IN_PROGRESS", `First step executed.. estimated time in seconds: ${txStep.estimate.executionDuration}, status: ${result.status}`, transactionHash.hash);
    // }

    const result = await getStatus({
      txHash: transactionHash.hash,
    });

    console.log(`Transaction hash: ${transactionHash.hash}, estimated time in seconds: ${txStep.estimate.executionDuration}, status: ${result.status}`);

    return response("IN_PROGRESS", `Estimated time in seconds: ${txStep.estimate.executionDuration}, status: ${result.status}`, transactionHash.hash);

  }

}
