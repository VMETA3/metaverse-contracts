import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const RaffleBag = await hre.deployments.deploy('RaffleBag', {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract RaffleBag deployed at ${RaffleBag.address}`);
};

export default func;
func.tags = ['RaffleBag'];
