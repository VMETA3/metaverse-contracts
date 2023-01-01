import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import {deployments, getNamedAccounts, ethers, network, upgrades} from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log} = hre.deployments;
  const {accounts} = await hre.getNamedAccounts();

  const owners = [accounts[0], accounts[1]];
  const investmentAddress = '';
  //chainlink configure
  const vrfCoordinatorV2Address = '0x6a2aad07396b36fe02a22b33cf443582f682c82f';
  const callbackGasLimit = 2500000;
  const subscribeId = 2387;
  const keyHash = '0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314';

  const DrawingGame = await hre.ethers.getContractFactory('DrawingGame');
  const DrawingGameProxy = await hre.upgrades.deployProxy(DrawingGame, [
    'DrawingGame',
    owners,
    2,
    investmentAddress,
    vrfCoordinatorV2Address,
    callbackGasLimit,
    subscribeId,
    keyHash,
  ]);
  await DrawingGameProxy.deployed();

  if (DrawingGameProxy.newlyDeployed) {
    log(
      `contract DrawingGameProxy deployed at ${DrawingGameProxy.address} using ${DrawingGameProxy.receipt?.gasUsed} gas`
    );
  }
};
export default func;
func.tags = ['DrawingGame'];
