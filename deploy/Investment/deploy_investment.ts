import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();

  const Investment = await hre.deployments.deploy('Investment', {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract Test deployed at ${Investment.address}`);
};

export default func;
func.tags = ['Investment'];
