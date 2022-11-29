import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log} = hre.deployments;
  const {owner} = await hre.getNamedAccounts();

  const Land = await hre.ethers.getContractFactory('Land');
  const LandProxy = await hre.upgrades.deployProxy(Land, ['VMeta3 Land', 'VMTLAND', owner]);
  await LandProxy.deployed();

  if (LandProxy.newlyDeployed) {
    log(`contract LandProxy deployed at ${LandProxy.address} using ${LandProxy.receipt?.gasUsed} gas`);
  }
};
export default func;
func.tags = ['LandProxy'];
func.dependencies = ['VMTLand'];
