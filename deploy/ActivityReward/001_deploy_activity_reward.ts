import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy, log} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();

  const ActivityReward = await deploy('ActivityReward', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (ActivityReward.newlyDeployed) {
    log(`contract Land deployed at ${ActivityReward.address} using ${ActivityReward.receipt?.gasUsed} gas`);
  }
};
export default func;
func.tags = ['ActivityReward'];
