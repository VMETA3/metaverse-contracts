import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import {deployments, getNamedAccounts, ethers, network, upgrades} from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log} = hre.deployments;
  const {accounts} = await hre.getNamedAccounts();

  const VM3 = await deployments.get('VM3'); // VMeta3 Token
  const owners = [accounts[0], accounts[1]];
  const startTime = await time.latest();
  const endTime = await time.latest();
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
