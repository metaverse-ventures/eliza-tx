import { Address, Hash } from "viem";

export interface Transaction {
  hash: Hash;
  from: Address;
  to: Address;
  value: bigint;
  data?: `0x${string}`;
  chainId?: number;
}

  
export interface IResponse {
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  message: string;
  hash?: string | null | Hash;
}
