import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {diamond} = deployments;

  const {deployer, owner, Administrator1, Administrator2} = await getNamedAccounts();

  await diamond.deploy('HelloDiamond', {
    from: deployer,
    owner: owner,
    facets: ['Hello'],
    execute: {
      methodName: '__Hello_init',
      args: ['Hello World! Mingjing'],
    },
    log: true,
  });
};
export default func;
func.tags = ['HelloDiamond'];
