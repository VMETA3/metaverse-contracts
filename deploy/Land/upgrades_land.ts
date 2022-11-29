import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  //   const { log } = hre.deployments;
  //   const { owner } = await hre.getNamedAccounts();
  //   const LandV2 = await hre.ethers.getContractFactory('LandV2');
  //   const upgraded = await hre.upgrades.upgradeProxy("", LandV2, { owner });
  //   if (upgraded.newlyDeployed) {
  //     log(
  //       `contract LandProxy deployed at ${upgraded.address} using ${upgraded.receipt?.gasUsed} gas`
  //     );
  //   }
};
export default func;
// func.tags = ['LandProxy'];
// func.dependencies = ['VMTLand'];
