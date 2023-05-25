import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer, Administrator1, Administrator2 } = await getNamedAccounts();

  const Name = 'VMeta3 Land';
  const Symbol = 'VM3Land';
  const TestVOV = await hre.ethers.getContract('VM3');
  const ActiveThreshold = hre.ethers.utils.parseEther('100');
  const MinimumInjectionQuantity = hre.ethers.utils.parseEther('1');
  
  await deploy('Land', {
    from: deployer,
    args: [Name, Symbol, TestVOV.address, Administrator1, Administrator2, ActiveThreshold, MinimumInjectionQuantity],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
};
export default func;
func.tags = ['VMTLand'];
