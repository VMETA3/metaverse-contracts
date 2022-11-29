import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy, log} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();

  const Land = await deploy('Land', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (Land.newlyDeployed) {
    log(`contract Land deployed at ${Land.address} using ${Land.receipt?.gasUsed} gas`);
  }
};
export default func;
func.tags = ['VMTLand'];
