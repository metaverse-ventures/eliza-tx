import { Injectable } from '@nestjs/common';
import { SwapPayloadDTO } from './dto/swap.dto';
import { PrivyClient } from '@privy-io/server-auth';
import {
  BlockheightBasedTransactionConfirmationStrategy,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import WalletClientService from 'src/_common/service/walletClient.service';
import { ConfigService } from '@nestjs/config';
import AuthTokenService from 'src/_common/service/authToken.service';
import {
  createConfig,
  ExtendedChain,
  getRoutes,
  getStatus,
  getStepTransaction,
  getToken,
  getTokenAllowance,
  getTokenBalance,
} from '@lifi/sdk';
import {
  encodeFunctionData,
  formatEther,
  Hash,
  parseUnits,
  PublicClient,
  TransactionReceipt,
  WalletClient,
  zeroAddress,
} from 'viem';
import { approvalABI } from 'src/_common/helper/abi';
import {
  nativeSOLAddress,
  solChainId,
  supportEVMSwapChains,
} from 'src/_common/helper/constants';
import { IResponse } from 'src/_common/utils/interface';
import { response } from 'src/_common/helper/response';
import { PrivyConfig } from 'src/_common/service/privy.service';

type ProjectType = 'invoice' | 'otc' | 'seekers';

@Injectable()
export class SwapService {
  private privy: PrivyClient;
  private readonly connection: Connection;

  constructor(
    private authTokenService: AuthTokenService,
    private walletClientService: WalletClientService,
    private privyConfig: PrivyConfig,
  ) {}

  async getTokenAddressAndDecimal(
    tokenSymbol: string,
    chainId: number,
  ): Promise<{ tokenAddress: string; tokenDec: number }> {
    const token = await getToken(chainId, tokenSymbol);
    const tokenDec = token?.decimals;
    const tokenAddress = token?.address;
    return { tokenAddress, tokenDec };
  }

  async transferSwap(swapDTO: SwapPayloadDTO, authToken: string) {
    console.log('swapDTO', swapDTO);
    this.privy = this.privyConfig.initializePrivyClient(
      swapDTO.projectType as ProjectType,
    );
    if (
      (swapDTO.chain.toLowerCase() as string) == 'sol' ||
      (swapDTO.chain.toLowerCase() as string) == 'solana'
    ) {
      return this.swapSol(swapDTO, authToken);
    }
    if (supportEVMSwapChains.includes(swapDTO.chain.toLowerCase() as string)) {
      return this.evmSwap(swapDTO, authToken);
    }
    return response(
      'FAILED',
      `Given chain: ${swapDTO.chain.toLowerCase()} is not supported for swap`,
    );
  }

  private async swapSol(swapDTO: SwapPayloadDTO, authToken: string) {
    console.log('swapDTO', swapDTO);
    this.privy = this.privyConfig.initializePrivyClient(
      swapDTO.projectType as ProjectType,
    );

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    const [
      solanaAddress,
      { tokenAddress: inputTokenAddress, tokenDec },
      { tokenAddress: outputTokenAddress },
    ] = await Promise.all([
      this.walletClientService.verifyAndGetSolAddress(authToken),
      this.getTokenAddressAndDecimal(
        swapDTO.inputToken.toUpperCase(),
        solChainId,
      ),
      this.getTokenAddressAndDecimal(
        swapDTO.outputToken.toUpperCase(),
        solChainId,
      ),
    ]);
    const senderPubKey = new PublicKey(solanaAddress);

    const amountToSend = (
      parseFloat(swapDTO.amount) * Math.pow(10, tokenDec)
    ).toString();
    console.log({
      solanaAddress,
      inputTokenAddress,
      tokenDec,
      outputTokenAddress,
      amountToSend,
    });

    if (inputTokenAddress !== nativeSOLAddress) {
      const { getAccount, getAssociatedTokenAddress } = await import(
        '@solana/spl-token'
      );
      const inputTokenAccount = new PublicKey(inputTokenAddress);
      const senderTokenATAData = await getAssociatedTokenAddress(
        inputTokenAccount,
        senderPubKey,
      );

      console.log({ inputTokenAccount });
      const [info, solBalance] = await Promise.all([
        getAccount(this.connection, senderTokenATAData),
        this.connection.getBalance(senderPubKey),
      ]);
      console.log({ info: info.amount, solBalance });
      if (info.amount == null)
        return response(
          'FAILED',
          `No balance found for ${swapDTO.inputToken}. Please fund the account`,
        );
      if (parseInt(info.amount.toString()) < parseInt(amountToSend))
        return response(
          'FAILED',
          `Insufficient balance for ${swapDTO.inputToken} to do this transaction. Please fund the account`,
        );
      if (solBalance === 0)
        return response(
          'FAILED',
          `Insufficient native SOL balance to proceed with the transaction. Please fund the account`,
        );
    } else {
      const solBalance = await this.connection.getBalance(senderPubKey);
      if (solBalance <= parseInt(amountToSend))
        return response(
          'FAILED',
          `Insufficient native SOL balance to proceed with the transaction. Please fund the account`,
        );
    }
    const routes = await getRoutes({
      fromChainId: solChainId,
      fromAmount: amountToSend,
      toChainId: solChainId,
      fromTokenAddress: inputTokenAddress,
      toTokenAddress: outputTokenAddress,
      fromAddress: solanaAddress,
      toAddress: solanaAddress,
    });

    console.log(routes);
    const stepTX = await getStepTransaction(routes.routes[0].steps[0]);

    console.log({ stepTX });
    console.log('steps', routes.routes[0].steps[0].includedSteps);

    if (outputTokenAddress !== nativeSOLAddress) {
      const {
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
      } = await import('@solana/spl-token');
      const recieverTokenPubKey = new PublicKey(outputTokenAddress);
      const recievedTokenATAdata = await getAssociatedTokenAddress(
        recieverTokenPubKey,
        senderPubKey,
      );

      const accountInfo =
        await this.connection.getAccountInfo(recievedTokenATAdata);
      console.log({ accountInfo });

      if (!accountInfo) {
        console.log(
          `2 - Creating ATA for Recipient since there accountInfo is not present`,
        );
        const transferInstruction =
          await createAssociatedTokenAccountInstruction(
            senderPubKey,
            recievedTokenATAdata,
            senderPubKey,
            recieverTokenPubKey,
          );

        const transaction = new Transaction({
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
          feePayer: senderPubKey, // Set the fee payer
        }).add(transferInstruction);

        const data = await this.privy.walletApi.solana.signAndSendTransaction({
          address: solanaAddress,
          caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', //solana mainnet
          chainType: 'solana',
          transaction: transaction,
        });

        console.log({ data });
        await this.connection.confirmTransaction(
          {
            signature: data.hash,
          } as BlockheightBasedTransactionConfirmationStrategy,
          'finalized',
        );
      }
    }

    const transactionBuf = Buffer.from(
      stepTX.transactionRequest.data,
      'base64',
    );

    const swapTransaction = VersionedTransaction.deserialize(transactionBuf);

    const sign = await this.privy.walletApi.solana.signTransaction({
      address: solanaAddress,
      chainType: 'solana',
      transaction: swapTransaction,
    });

    const txnId = await this.connection.sendTransaction(
      sign.signedTransaction as VersionedTransaction,
      {
        maxRetries: 5,
        skipPreflight: true,
      },
    );
    console.log({ txnId });

    const status = await this.connection.getSignatureStatus(txnId);
    console.log({ status });

    const a = await this.connection.confirmTransaction(
      {
        signature: txnId,
      } as BlockheightBasedTransactionConfirmationStrategy,
      'processed',
    );
    console.log({ a });

    const res: IResponse = {
      status: 'IN_PROGRESS',
      message: `Transaction confirmed, status: ${status}`,
      hash: txnId,
    };
    return res;
  }

  private async evmSwap(SwapPayloadDTO: SwapPayloadDTO, authToken: string) {
    try {
      const chainId =
        await this.walletClientService.chains[SwapPayloadDTO.chain].id;
      const walletClient: WalletClient =
        await this.walletClientService.createWalletClient({
          authToken,
          chain: SwapPayloadDTO.chain,
        });

      const publicClient =
        await this.walletClientService.createPublicClient(chainId);

      const [fromAddress] = await walletClient.getAddresses();

      const [
        { tokenAddress: inputTokenAddress, tokenDec },
        { tokenAddress: outputTokenAddress },
      ] = await Promise.all([
        this.getTokenAddressAndDecimal(
          SwapPayloadDTO.inputToken.toUpperCase(),
          chainId,
        ),
        this.getTokenAddressAndDecimal(
          SwapPayloadDTO.outputToken.toUpperCase(),
          chainId,
        ),
      ]);

      createConfig({
        integrator: 'eliza',
        chains: Object.values(this.walletClientService.chains).map(
          (config) => ({
            id: config.id,
            name: config.name,
            key: config.name.toLowerCase(),
            chainType: 'EVM' as const,
            nativeToken: {
              ...config.nativeCurrency,
              chainId: config.id,
              address: '0x0000000000000000000000000000000000000000',
              coinKey: config.nativeCurrency.symbol,
              priceUSD: '0',
              logoURI: '',
              symbol: config.nativeCurrency.symbol,
              decimals: config.nativeCurrency.decimals,
              name: config.nativeCurrency.name,
            },
            rpcUrls: {
              public: { http: [config.rpcUrls.default.http[0]] },
            },
            blockExplorerUrls: [config.blockExplorers.default.url],
            metamask: {
              chainId: `0x${config.id.toString(16)}`,
              chainName: config.name,
              nativeCurrency: config.nativeCurrency,
              rpcUrls: [config.rpcUrls.default.http[0]],
              blockExplorerUrls: [config.blockExplorers.default.url],
            },
            coin: config.nativeCurrency.symbol,
            mainnet: true,
            diamondAddress: '0x0000000000000000000000000000000000000000',
          }),
        ) as ExtendedChain[],
      });

      const fromAmount = parseUnits(SwapPayloadDTO.amount, tokenDec);
      const fromAmountString = fromAmount.toString();

      const routes = await getRoutes({
        fromChainId: this.walletClientService.chains[SwapPayloadDTO.chain].id,
        toChainId: this.walletClientService.chains[SwapPayloadDTO.chain].id,
        fromTokenAddress: inputTokenAddress,
        toTokenAddress: outputTokenAddress,
        fromAmount: fromAmountString as string,
        fromAddress: fromAddress,
      });

      if (!routes.routes.length) {
        console.error('No routes found');
        const res: IResponse = {
          status: 'FAILED',
          message:
            'No routes found for this token combination. Please try again',
        };
        return res;
      }

      const route = routes.routes[0];

      try {
        for (const txStep of route.steps) {
          const step = await getStepTransaction(txStep);

          console.log('step with transaction data: ', step);

          const chainId = step.transactionRequest.chainId;

          const token = {
            address: inputTokenAddress,
            chainId: chainId,
          };

          const inputToken = await getToken(token.chainId, token.address);
          const tokenBalance = await getTokenBalance(
            walletClient.account.address,
            inputToken,
          );

          console.log('Token balance:', tokenBalance.amount.toString());
          if (
            parseInt(tokenBalance.amount.toString()) <
            parseInt(fromAmountString)
          ) {
            console.error('Insufficient balance');
            const res: IResponse = {
              status: 'FAILED',
              message: `Insufficient balance for ${SwapPayloadDTO.inputToken} to do this transaction. Please fund the account`,
            };
            return res;
          }

          // Check if fromAddress is not the zero address
          if (inputTokenAddress !== zeroAddress) {
            const allowance = await getTokenAllowance(
              token,
              walletClient.account.address,
              step.estimate.approvalAddress,
            );
            if (
              parseInt(allowance.toString()) <=
              parseInt(step.estimate.fromAmount)
            ) {
              const approvalAmount = step.estimate.fromAmount;
              const approvalAddress = step.estimate.approvalAddress;

              const data = encodeFunctionData({
                abi: approvalABI,
                functionName: 'approve',
                args: [approvalAddress, approvalAmount],
              });

              const nativeBalance = await publicClient.getBalance({
                address: walletClient.account.address,
              });

              const gas = await publicClient.estimateGas({
                data,
                account: walletClient.account.address,
                to: step.action.fromToken.address,
              });

              console.log('Native balance:', nativeBalance);
              console.log('Estimated gas:', gas);

              // Check if native balance is less than estimated gas
              if (nativeBalance < gas) {
                console.error(
                  'Native balance is less than estimated gas. Transaction cannot proceed.',
                );
                const res: IResponse = {
                  status: 'FAILED',
                  message:
                    'Native balance is less than estimated gas. Transaction cannot proceed.',
                };
                return res;
              }

              const transactionParam = {
                to: inputTokenAddress,
                chainId: chainId,
                data: data,
              };

              const approved: any =
                await this.privy.walletApi.ethereum.sendTransaction({
                  address: walletClient.account.address.toLowerCase(),
                  chainType: 'ethereum',
                  caip2: `eip155:${chainId}`,
                  transaction: transactionParam,
                });

              console.log('approval hash:', approved.hash);

              // Wait for approval transaction to be confirmed
              await this.waitForConfirmation(
                publicClient as PublicClient,
                approved.hash as Hash,
              );

              console.log('Allowance:', formatEther(allowance));
            }
          }

          // Send the transaction (e.g. using Viem)
          const transactionRequestWithParams = {
            address: walletClient.account.address.toLowerCase(),
            chainType: 'ethereum',
            caip2: `eip155:${chainId}`,
            transaction: step.transactionRequest,
          };
          const transactionHash: any =
            await this.privy.walletApi.ethereum.sendTransaction(
              transactionRequestWithParams,
            );

          console.log('Transaction hash', transactionHash.hash);

          await this.waitForConfirmation(
            publicClient as PublicClient,
            transactionHash.hash as Hash,
          );

          let status;
          do {
            console.log('above status');

            const result = await getStatus({
              txHash: transactionHash.hash,
            });
            console.log('below status');

            status = result.status;
            console.log(
              `Transaction status for ${transactionHash.hash}:`,
              status,
            );

            // Wait for a short period before checking the status again
            await new Promise((resolve) => setTimeout(resolve, 30000));
          } while (status !== 'DONE' && status !== 'FAILED');

          if (status === 'FAILED') {
            console.error(`Transaction ${transactionHash.hash} failed`);
            const res: IResponse = {
              status: 'FAILED',
              message: `Transaction ${transactionHash.hash} failed`,
              hash: transactionHash.hash,
            };
            return res;
          }

          if (status === 'DONE') {
            console.log(`Transaction ${transactionHash.hash} succeeded`);
            const res: IResponse = {
              status: 'SUCCESS',
              message: `Transaction ${transactionHash.hash} succeeded`,
              hash: transactionHash.hash,
            };
            return res;
          }
        }

        console.log('All steps executed successfully');
      } catch (error) {
        throw new Error(`Error executing route: ${error.message}`);
      }

      return `Transaction executed successfully`;
    } catch (error) {
      console.error('Error during swap:', error);
      throw new Error(`Swap failed: ${error.message}`);
    }
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
        console.error(`Error fetching transaction receipt: ${error.message}`);
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
}
