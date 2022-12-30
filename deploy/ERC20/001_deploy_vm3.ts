import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, possessor, Administrator1, Administrator2} = await getNamedAccounts();

  const chainId = hre.network.config.chainId;
  const TotalMint = 80000000;
  const signRequired = 2;

  await deploy('VM3', {
    from: deployer,
    args: [chainId, TotalMint, possessor, [Administrator1, Administrator2], signRequired],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
};
export default func;
func.tags = ['VM3'];
