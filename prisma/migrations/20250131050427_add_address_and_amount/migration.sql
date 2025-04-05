/*
  Warnings:

  - Added the required column `secondStepApprovalAddress` to the `txnData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `secondStepApprovalAmount` to the `txnData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "txnData" ADD COLUMN     "secondStepApprovalAddress" TEXT NOT NULL,
ADD COLUMN     "secondStepApprovalAmount" TEXT NOT NULL;
