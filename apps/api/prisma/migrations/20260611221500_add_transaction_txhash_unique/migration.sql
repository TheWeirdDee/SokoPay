-- Permanently prevent duplicate transaction rows for the same on-chain transfer.
-- NULL txHash (cash/manual entries) is exempt: Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "Transaction_merchantId_txHash_direction_key"
  ON "Transaction" ("merchantId", "txHash", "direction");
