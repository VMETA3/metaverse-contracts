import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();

  const TestToken = await hre.deployments.deploy('TestERC20', {
    from: deployer,
    args: [],
  });

  hre.deployments.log(`contract Test deployed at ${TestToken.address}`);
};

export default func;
func.tags = ['TestToken'];
