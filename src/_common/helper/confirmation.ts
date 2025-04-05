import { Hash, PublicClient, TransactionReceipt } from 'viem';

export async function waitForConfirmation(
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
