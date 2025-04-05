/*
  Warnings:

  - You are about to drop the column `privyId` on the `txnData` table. All the data in the column will be lost.
  - Added the required column `privyWalletAddress` to the `txnData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "txnData" DROP COLUMN "privyId",
ADD COLUMN     "privyWalletAddress" TEXT NOT NULL;
