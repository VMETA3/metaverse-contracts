import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();

  const testToken = await hre.deployments.get('TestERC20');

  const startTime = 1669704893;
  const endTime = 1672296893;
  const Investment = await hre.deployments.deploy('Investment', {
    from: deployer,
    args: [testToken.address, deployer, startTime, endTime],
  });

  hre.deployments.log(`contract Test deployed at ${Investment.address}`);
};

export default func;
func.tags = ['Investment'];
func.dependencies = ['TestToken'];