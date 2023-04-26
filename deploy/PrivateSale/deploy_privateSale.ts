import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {ethers} from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();
  const VM3 = await ethers.getContract('VM3');
  const USDT = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';

  await deploy('PrivateSale', {
    from: deployer,
    args: [[Administrator1, Administrator2], 2, VM3.address, USDT],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
};
export default func;
func.tags = ['PrivateSale'];
