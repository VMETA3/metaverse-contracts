import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const LogicName = 'RaffleBag';

  const RaffleBag = await hre.deployments.deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract RaffleBag deployed at ${RaffleBag.address}`);

  const ProxyList = [
    'Proxy_Active_' + LogicName,
    'Proxy_Event_' + LogicName,
    'Proxy_VIP_LV1_' + LogicName,
    'Proxy_VIP_LV2_' + LogicName,
    'Proxy_VIP_LV3_' + LogicName,
  ];

  for (let i = 0; i < ProxyList.length; i++) {
    await deployProxy(hre, LogicName, ProxyList[i]);
  }
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
  const { log, getExtendedArtifact, save } = hre.deployments;
  console.log(`Upgrading ${LogicName}...`);
  const Proxy = await hre.deployments.get(ProxyName);
  const Logic = await hre.ethers.getContractFactory(LogicName);

  await hre.upgrades.upgradeProxy(Proxy.address, Logic);

  const artifact = await getExtendedArtifact(LogicName);
  const proxyDeployments = {
    address: Proxy.address,
    ...artifact,
  };
  await save(ProxyName, proxyDeployments);
  console.log("Upgrade succeeded");
};

export default func;
func.tags = ['UpgradeRaffleBag'];
