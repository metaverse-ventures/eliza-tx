/*
  Warnings:

  - Changed the type of `firstTxnStatus` on the `txnData` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "txnData" DROP COLUMN "firstTxnStatus",
ADD COLUMN     "firstTxnStatus" "TxnStatus" NOT NULL;
