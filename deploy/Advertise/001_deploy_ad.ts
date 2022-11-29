import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, log} = deployments;

  const {deployer} = await getNamedAccounts();

  const Time = await deployments.get('Time');
  log(`contract Time deployed at ${Time.address} using`);

  const Prize = await deployments.get('Prize');
  log(`contract Prize deployed at ${Prize.address} using`);

  await deploy('Advertise', {
    from: deployer,
    args: ['Test AD', 'TAD', 1000],
    // gasPrice: "80000000000",  // 1000000000 = 1 gwei
    // gasLimit: "30000000",
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    libraries: {
      Time: Time.address,
      Prize: Prize.address,
    },
  });
};
export default func;
func.tags = ['AD'];
func.dependencies = ['AD_Depend'];
