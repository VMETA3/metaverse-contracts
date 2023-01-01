import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();

  const DrawingGame = await hre.deployments.deploy('DrawingGame', {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract DrawingGame deployed at ${DrawingGame.address}`);
};

export default func;
func.tags = ['DrawingGame'];
