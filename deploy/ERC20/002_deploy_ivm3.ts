import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();

  const initialSupply = 200000;
  const mintTo = deployer;
  const signRequired = 2;

  await deploy('IVM3', {
    from: deployer,
    args: [initialSupply, mintTo, [Administrator1, Administrator2], signRequired],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
};
export default func;
func.tags = ['IVM3'];
