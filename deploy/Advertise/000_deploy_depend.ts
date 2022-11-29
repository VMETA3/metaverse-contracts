import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, log} = deployments;

  const {deployer} = await getNamedAccounts();

  if (!hre.network.live) {
    const TToken = await deploy('TestERC20', {
      from: deployer,
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    });
    log(`contract TToken deployed at ${TToken.address} using`);
  }

  const Time = await deploy('Time', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  log(`contract Time deployed at ${Time.address} using`);

  const Prize = await deploy('Prize', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  log(`contract Prize deployed at ${Prize.address} using`);
};
export default func;
func.tags = ['AD_Depend'];
