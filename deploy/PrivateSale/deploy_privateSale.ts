import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {diamond} = deployments;

  const {deployer, owner} = await getNamedAccounts();

  await diamond.deploy('PrivateSaleDiamond', {
    from: deployer,
    owner: owner,
    facets: ['PrivateSale'],
    log: true,
  });
};
export default func;
func.tags = ['PrivateSaleDiamond', 'PrivateSaleDiamond_deploy'];
