import { Injectable } from '@nestjs/common';
import { TransferDTO } from './dto/transfer.dto';
import WalletClientService from 'src/_common/service/walletClient.service';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/server-auth';
import AuthTokenService from 'src/_common/service/authToken.service';
import {
  Transaction,
  SystemProgram,
  PublicKey,
  Connection,
  ParsedAccountData,
  TransactionMessage,
  VersionedTransaction,
  BlockheightBasedTransactionConfirmationStrategy,
} from '@solana/web3.js';
import { getToken } from '@lifi/sdk';
import { nativeSOLAddress, solChainId } from 'src/_common/helper/constants';
import { response } from 'src/_common/helper/response';
import { PrivyConfig, ProjectType } from 'src/_common/service/privy.service';


@Injectable()
export class SolanaTxService {
  private privy: PrivyClient;
  private readonly connection: Connection;

  constructor(
    private authTokenService: AuthTokenService,
    private walletClientService: WalletClientService,
    private privyConfig: PrivyConfig,
    private configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
  }


  async getNumberDecimals(mintAddress: string): Promise<number> {
    const info = await this.connection.getParsedAccountInfo(
      new PublicKey(mintAddress),
    );
    const result = (info.value?.data as ParsedAccountData).parsed.info
      .decimals as number;
    return result;
  }

  async getTokenAddressAndDecimal(
    tokenSymbol: string,
    chainId: number,
  ): Promise<{ tokenAddress: string; tokenDec: number }> {
    const token = await getToken(chainId, tokenSymbol);
    const tokenDec = token?.decimals;
    const tokenAddress = token?.address;
    return { tokenAddress, tokenDec };
  }

  async transfer(transferDTO: TransferDTO, authToken: string) {
    console.log({transferDTO});
  
    this.privy = this.privyConfig.initializePrivyClient(
      transferDTO.projectType as ProjectType);

    const [
      solanaAddress,
      { blockhash, lastValidBlockHeight },
      { tokenAddress: inputTokenAddress, tokenDec },
    ] = await Promise.all([
      this.walletClientService.verifyAndGetSolAddress(authToken, transferDTO.projectType),
      this.connection.getLatestBlockhash(),
      this.getTokenAddressAndDecimal(transferDTO.token, solChainId),
    ]);
  console.log({
    solanaAddress,
    blockhash,
    lastValidBlockHeight,
    inputTokenAddress,
    tokenDec,
  })
    const amountToSend = (
      parseFloat(transferDTO.amount) * Math.pow(10, tokenDec)
    ).toString();

    console.log({ amountToSend });

    const recipientPubKey = new PublicKey(transferDTO.toAddress);
    const senderPubKey = new PublicKey(solanaAddress);
    console.log(inputTokenAddress !== nativeSOLAddress);
    

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
          `No balance found for ${transferDTO.token}. Please fund the account`,
        );
      if (parseInt(info.amount.toString()) < parseInt(amountToSend))
        return response(
          'FAILED',
          `Insufficient balance for ${transferDTO.token} to do this transaction. Please fund the account`,
        );
      if (solBalance === 0)
        return response(
          'FAILED',
          `Insufficient native SOL balance to proceed with the transaction. Please fund the account`,
        );
    } else {
      const solBalance = await this.connection.getBalance(senderPubKey);
      console.log({ solBalance, amountToSend });
      if (solBalance <= parseInt(amountToSend)) {
        console.log(
          `Insufficient native SOL balance: ${solBalance} required: ${amountToSend}`
        );
        return response(
          'FAILED',
          `Insufficient native SOL balance to proceed with the transaction. Please fund the account`,
        );
      }
    }

    if (inputTokenAddress !== nativeSOLAddress) {
      const {
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        createTransferInstruction,
      } = await import('@solana/spl-token');
      const tokenPubKey = new PublicKey(inputTokenAddress);
      const senderATAdata = await getAssociatedTokenAddress(
        tokenPubKey,
        senderPubKey,
      );
      const recieverATAdata = await getAssociatedTokenAddress(
        tokenPubKey,
        recipientPubKey,
      );

      const accountInfo = await this.connection.getAccountInfo(recieverATAdata);
      const instruction = [];
      if (!accountInfo) {
        console.log(
          `2 - Creating ATA for Recipient since there accountInfo is not present`,
        );
        const txnInstruct = await createAssociatedTokenAccountInstruction(
          senderPubKey,
          recieverATAdata,
          recipientPubKey,
          tokenPubKey,
        );
        instruction.push(txnInstruct);
      }

      instruction.push(
        createTransferInstruction(
          senderATAdata,
          recieverATAdata,
          senderPubKey,
          parseInt(amountToSend),
        ),
      );

      const messageV0 = new TransactionMessage({
        payerKey: senderPubKey,
        recentBlockhash: blockhash,
        instructions: instruction,
      }).compileToV0Message();

      const versionedTransaction = new VersionedTransaction(messageV0);

      const data = await this.privy.walletApi.solana.signAndSendTransaction({
        address: solanaAddress,
        caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', //solana mainnet
        chainType: 'solana',
        transaction: versionedTransaction,
      });

      console.log({ data });
      await this.connection.confirmTransaction(
        {
          signature: data.hash,
        } as BlockheightBasedTransactionConfirmationStrategy,
        'processed',
      );
      return response(
        'IN_PROGRESS',
        `Transfering ${transferDTO.amount} ${transferDTO.token} from ${solanaAddress} to ${recipientPubKey.toString()}`,
        data.hash,
      );
    }

    const transaction = new Transaction({
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
      feePayer: senderPubKey, // Set the fee payer
    }).add(
      SystemProgram.transfer({
        fromPubkey: senderPubKey,
        toPubkey: recipientPubKey,
        lamports: parseInt(amountToSend),
      }),
    );

    const data = await this.privy.walletApi.solana.signAndSendTransaction({
      address: solanaAddress,
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', //solana mainnet
      chainType: 'solana',
      transaction: transaction,
    });
    console.log({ data });

    return response(
      'IN_PROGRESS',
      `Transfering ${transferDTO.amount} ${transferDTO.token} from ${solanaAddress} to ${recipientPubKey.toString()}`,
      data.hash,
    );
  }
}
