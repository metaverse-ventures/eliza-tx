-- CreateTable
CREATE TABLE "txnData" (
    "id" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "privyId" TEXT NOT NULL,
    "txnStepNo" INTEGER NOT NULL,
    "firstTxnHash" TEXT NOT NULL,
    "firstTxnStatus" TEXT NOT NULL,
    "firstTxnEstTime" TIMESTAMP(3) NOT NULL,
    "secondTxnData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "txnData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "txnData_txnId_key" ON "txnData"("txnId");
