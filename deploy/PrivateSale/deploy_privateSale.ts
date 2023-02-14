import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {diamond} = deployments;

  const {deployer, owner, Administrator1, Administrator2} = await getNamedAccounts();

  await diamond.deploy('PrivateSaleDiamond', {
    from: deployer,
    owner: owner,
    facets: ['PrivateSale'],
    execute: {
      methodName: '__PrivateSale_init',
      args: [
        [Administrator1, Administrator2],
        2,
        '0xFC04fA99eBdd826788EE98062d607b31C8069029',
        '0x35375c3636eaaef31a63fdd9a1b16f911d67d5b5',
      ],
    },
    log: true,
  });
};
export default func;
func.tags = ['PrivateSaleDiamond'];
