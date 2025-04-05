/*
  Warnings:

  - You are about to drop the column `txnId` on the `txnData` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "txnData_txnId_key";

-- AlterTable
ALTER TABLE "txnData" DROP COLUMN "txnId";
