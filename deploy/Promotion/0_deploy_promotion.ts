import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, Administrator1, Administrator2, owner } = await hre.getNamedAccounts();
  const Owners = [Administrator1, Administrator2, owner];
  const LogicName = 'PromotionV1';

  const RaffleBag = await hre.deployments.deploy(LogicName, {
    from: deployer,
    args: [Owners, 2],
    log: true,
    autoMine: true,
  });
  hre.deployments.log(`contract ${LogicName} deployed at ${RaffleBag.address}`);
};

export default func;
func.tags = ['Promotion'];
