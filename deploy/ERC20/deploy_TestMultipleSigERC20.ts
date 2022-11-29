import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, user1, user2, user3, user4, user5} = await getNamedAccounts();

  const chainId = hre.network.config.chainId;
  const TotalMint = 1000000;
  const signRequired = 2;

  if (!hre.network.live) {
    await deploy('TestMultipleSigERC20', {
      from: deployer,
      args: [chainId, TotalMint, user1, [user1, user2, user3, user4, user5], signRequired],
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    });
  }
};
export default func;
func.tags = ['TestMultipleSigERC20'];
