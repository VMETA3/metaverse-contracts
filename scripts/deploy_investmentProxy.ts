import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import {deployments} from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log} = hre.deployments;
  const {accounts} = await hre.getNamedAccounts();

  const VM3 = await deployments.get('VM3'); // VMeta3 Token
  const owners = ['0xfeaD27a71FDA8458d8b9f9055B50800eCbCaA10e', '0x2Fe8D2Bc3FD37cD7AcbbE668A7a12F957e79D708'];
  const startTime = await time.latest();
  const endTime = (await time.latest()) + 24 * 60 * 60 * 180;
  const interestAccount = accounts[0];

  const Investment = await hre.ethers.getContractFactory('Investment');
  const InvestmentProxy = await hre.upgrades.deployProxy(Investment, [
    'Investment',
    owners,
    2,
    VM3.address,
    interestAccount,
    startTime,
    endTime,
  ]);
  await InvestmentProxy.deployed();

  if (InvestmentProxy.newlyDeployed) {
    log(
      `contract InvestmentProxy deployed at ${InvestmentProxy.address} using ${InvestmentProxy.receipt?.gasUsed} gas`
    );
  }
};
export default func;
func.tags = ['Investment'];
