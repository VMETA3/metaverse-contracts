import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy, log} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();

  const Elf = await deploy('VM3Elf', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (Elf.newlyDeployed) {
    log(`contract Land deployed at ${Elf.address} using ${Elf.receipt?.gasUsed} gas`);
  }
};
export default func;
func.tags = ['VM3Elf'];
