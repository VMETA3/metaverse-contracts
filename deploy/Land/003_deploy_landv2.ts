import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.live) {
    const {deploy, log} = hre.deployments;
    const {deployer} = await hre.getNamedAccounts();

    const LandV2 = await deploy('LandV2', {
      from: deployer,
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    });

    if (LandV2.newlyDeployed) {
      log(`contract LandV2 deployed at ${LandV2.address} using ${LandV2.receipt?.gasUsed} gas`);
    }
  }
};
export default func;
func.tags = ['VMTLandV2'];
func.dependencies = ['LandProxy'];
