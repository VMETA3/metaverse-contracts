import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, log} = deployments;

  const {deployer} = await getNamedAccounts();
  const Time = await deploy('Time', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (Time.newlyDeployed) {
    log(`contract Time deployed at ${Time.address} using`);
  }

  const Prize = await deploy('Prize', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (Prize.newlyDeployed) {
    log(`contract Prize deployed at ${Prize.address} using`);
  }
};
export default func;
func.tags = ['AD_Depend'];
