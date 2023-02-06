import 'dotenv/config';
import {ethers} from 'hardhat';

export interface ChainlinkConfig {
  contract: string;
  gasLimit: string;
  subscribeId: string;
  keyHash: string;
  requestConfirmations: string;
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
    };
  }
  let contract, gasLimit, subscribeId, keyHash, requestConfirmations;
  if (networkName) {
    contract = process.env['CHAINLINK_CONTRACT_' + networkName.toUpperCase()];
    gasLimit = process.env['CHAINLINK_GAS_LIMIT_' + networkName.toUpperCase()];
    subscribeId = process.env['CHAINLINK_SUBSCRIBE_ID_' + networkName.toUpperCase()];
    keyHash = process.env['CHAINLINK_KEY_HASH_' + networkName.toUpperCase()];
    requestConfirmations = process.env['CHAINLINK_REQUEST_CONFIRMATIONS_' + networkName.toUpperCase()];
  } else {
    contract = process.env['CHAINLINK_CONTRACT'];
    gasLimit = process.env['CHAINLINK_GAS_LIMIT'];
    subscribeId = process.env['CHAINLINK_SUBSCRIBE_ID'];
    keyHash = process.env['CHAINLINK_KEY_HASH'];
    requestConfirmations = process.env['CHAINLINK_REQUEST_CONFIRMATIONS'];
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
  const Chain: ChainlinkConfig = {
    contract: contract,
    gasLimit: gasLimit,
    subscribeId: subscribeId,
    keyHash: keyHash,
    requestConfirmations: requestConfirmations,
  };
  return Chain;
}
