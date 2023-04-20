import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {ethers} from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();
  const VM3 = await ethers.getContract('VM3');
  const USDT = '0x55d398326f99059fF775485246999027B3197955';

  await deploy('PrivateSale', {
    from: deployer,
    args: [[Administrator1, Administrator2], 2, VM3.address, USDT],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
};
export default func;
func.tags = ['PrivateSale'];
