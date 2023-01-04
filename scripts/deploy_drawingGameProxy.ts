import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {time} from '@nomicfoundation/hardhat-network-helpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log} = hre.deployments;
  const {accounts} = await hre.getNamedAccounts();

  const investment = await hre.deployments.get('Investment'); // VMeta3 Token
  const owners = ['0xfeaD27a71FDA8458d8b9f9055B50800eCbCaA10e', '0x2Fe8D2Bc3FD37cD7AcbbE668A7a12F957e79D708'];
  const investmentAddress = investment.address;
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
