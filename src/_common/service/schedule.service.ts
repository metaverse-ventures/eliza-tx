import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Cron } from '@nestjs/schedule';
import { TxnStatus } from "@prisma/client";
import { getStatus } from "@lifi/sdk";
import { encodeFunctionData, Hash, PublicClient } from "viem";
import { allowanceABI, approvalABI } from "../helper/abi";
import { PrivyClient } from "@privy-io/server-auth";
import { waitForConfirmation } from "../helper/confirmation";
import WalletClientService from "./walletClient.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ScheduleService {
    private readonly privy: PrivyClient;
    private readonly logger = new Logger(ScheduleService.name);
    constructor(
        private readonly prismaService: PrismaService,
        private readonly walletClientService: WalletClientService,
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

    @Cron('0 */15 * * * *', { name: 'perform-second-step' })
    async performSecond() {
        this.logger.log('cron for second step started')
        const currentTime = new Date().getTime();

        const pendingTxns = await this.prismaService.txnData.findMany({
            where: {
                firstTxnStatus: TxnStatus.PENDING,
                firstTxnEstTime: { lte: new Date(currentTime) },
            }
        })

        this.logger.debug(`Pending Transactions length: ${pendingTxns.length}`);
        if (pendingTxns.length > 0) {
            pendingTxns.forEach(async txn => {
                this.logger.debug(`Processing Transaction: ${txn.id}`);
                // check the status of the transaction
                const result = await getStatus({
                    txHash: txn.firstTxnHash,
                });

                console.log('status', result.status)

                try {
                    if (result.status === 'DONE') {
                        console.log({
                            to: txn.secondTxnData['to'],
                            chainId: txn.secondTxnData['chainId']
                        })
                        const publicClient = await this.walletClientService.createPublicClient(txn.secondTxnData['chainId'])
                        const allowance = await publicClient.readContract({
                            address: txn.secondStepApprovalAddress as `0x${string}`,
                            abi: allowanceABI,
                            functionName: 'allowance',
                            args: [txn.privyWalletAddress, txn.secondTxnData['to']]
                        })
                        console.log({allowance: allowance.toString()})

                        if(parseInt(allowance.toString()) < parseInt(txn.secondStepApprovalAmount) ) {
                            const data = encodeFunctionData({
                                abi: approvalABI,
                                functionName: 'approve',
                                args: [txn.secondTxnData['to'], txn.secondStepApprovalAmount],
                            });   
  
                            const transactionParam = {
                                to:txn.secondStepApprovalAddress,
                                chainId: txn.secondTxnData['chainId'],
                                data: data,
                            };    
    
                            const approved: any = await this.privy.walletApi.ethereum.sendTransaction({
                                address: txn.privyWalletAddress,
                                chainType: 'ethereum',
                                caip2: `eip155:${txn.secondTxnData['chainId']}`,
                                transaction: transactionParam,
                            });
                            console.log({ Apporvalhash: approved.hash });
                            await waitForConfirmation(
                                publicClient as PublicClient,
                                approved.hash as Hash,
                            );
    
                        }
                        const transactionRequestWithParams = {
                            address: txn.privyWalletAddress,
                            chainType: 'ethereum',
                            caip2: `eip155:${txn.secondTxnData['chainId']}`,
                            transaction: txn.secondTxnData,
                        };
                        const transactionHash: any =
                            await this.privy.walletApi.ethereum.sendTransaction(
                                transactionRequestWithParams,
                            );

                        console.log(`Transaction hash: ${transactionHash.hash}`);
                    }
                } catch (error) {
                    this.logger.error(`Error processing transaction ${txn.id}: ${error.message}`, error.stack);
                }

                

            })
        }
    }
}