import 'dotenv/config';
import { ethers } from 'hardhat';

export interface ChainlinkConfig {
  contract: string;
  gasLimit: string;
  subscribeId: string;
  keyHash: string;
  requestConfirmations: string;
  requestCount: string;
  linkToken: string;
  oracle: string;
  jobId: string;
  fee: string;
}

export function getChainlinkConfig(networkName: string): ChainlinkConfig {
  if (networkName === 'localhost' || networkName === 'hardhat') {
    // do not use ETH_NODE_URI
    return <ChainlinkConfig>{
      contract: '0x6a2aad12345636fe02a22b33cf443582f682c82f',
      gasLimit: '2500000',
      subscribeId: '1',
      keyHash: ethers.constants.HashZero,
      requestConfirmations: '3',
      requestCount: '1',
      linkToken: '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06',
      oracle: '0xCC79157eb46F5624204f47AB42b3906cAA40eaB7',
      jobId: ethers.constants.HashZero,
      fee: '0.1',
    };
  }
  let contract, gasLimit, subscribeId, keyHash, requestConfirmations, requestCount,linkToken, oracle, jobId, fee;
  if (networkName) {
    contract = process.env['CHAINLINK_CONTRACT_' + networkName.toUpperCase()];
    gasLimit = process.env['CHAINLINK_GAS_LIMIT_' + networkName.toUpperCase()];
    subscribeId = process.env['CHAINLINK_SUBSCRIBE_ID_' + networkName.toUpperCase()];
    keyHash = process.env['CHAINLINK_KEY_HASH_' + networkName.toUpperCase()];
    requestConfirmations = process.env['CHAINLINK_REQUEST_CONFIRMATIONS_' + networkName.toUpperCase()];
    requestCount = process.env['CHAINLINK_REQUEST_COUNT_' + networkName.toUpperCase()];
    linkToken = process.env['CHAINLINK_LINK_TOKEN_' + networkName.toUpperCase()];
    oracle = process.env['CHAINLINK_ORACLE_' + networkName.toUpperCase()];
    jobId = process.env['CHAINLINK_JOB_ID_' + networkName.toUpperCase()];
    fee = process.env['CHAINLINK_FEE_' + networkName.toUpperCase()];
  } else {
    contract = process.env['CHAINLINK_CONTRACT'];
    gasLimit = process.env['CHAINLINK_GAS_LIMIT'];
    subscribeId = process.env['CHAINLINK_SUBSCRIBE_ID'];
    keyHash = process.env['CHAINLINK_KEY_HASH'];
    requestConfirmations = process.env['CHAINLINK_REQUEST_CONFIRMATIONS'];
    requestCount = process.env['CHAINLINK_REQUEST_COUNT'];
    linkToken = process.env['CHAINLINK_LINK_TOKEN'];
    oracle = process.env['CHAINLINK_ORACLE'];
    jobId = process.env['CHAINLINK_JOB_ID'];
    fee = process.env['CHAINLINK_FEE'];
  }
  if (contract === undefined) {
    contract = '';
  }
  if (gasLimit === undefined) {
    gasLimit = '';
  }
  if (subscribeId === undefined) {
    subscribeId = '';
  }
  if (keyHash === undefined) {
    keyHash = '';
  }
  if (requestConfirmations === undefined) {
    requestConfirmations = '';
  }
  if (requestCount === undefined) {
    requestCount = '';
  }
  if (linkToken === undefined) {
    linkToken = '';
  }
  if (oracle === undefined) {
    oracle = '';
  }
  if (jobId === undefined) {
    jobId = '';
  }
  if (fee === undefined) {
    fee = '';
  }
  const Chain: ChainlinkConfig = {
    contract: contract,
    gasLimit: gasLimit,
    subscribeId: subscribeId,
    keyHash: keyHash,
    requestConfirmations: requestConfirmations,
    requestCount: requestCount,
    linkToken: linkToken,
    oracle: oracle,
    jobId: jobId,
    fee: fee,
  };
  return Chain;
}
