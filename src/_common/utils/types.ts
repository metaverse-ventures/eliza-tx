import * as viemChains from 'viem/chains';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _SupportedChainList = Object.keys(viemChains) as Array<
  keyof typeof viemChains
>;
export type SupportedChain = (typeof _SupportedChainList)[number];
