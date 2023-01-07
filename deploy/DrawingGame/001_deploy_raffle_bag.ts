import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { setupUser, setupUsers } from '../../test/utils';
import { RaffleBag } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const LogicName = "RaffleBag";

  const RaffleBag = await hre.deployments.deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract RaffleBag deployed at ${RaffleBag.address}`);

  const ProxyList = [
    "Proxy_Active_" + LogicName,
    "Proxy_Event_" + LogicName,
    "Proxy_VIP_LV1_" + LogicName,
    "Proxy_VIP_LV2_" + LogicName,
    "Proxy_VIP_LV3_" + LogicName,
  ];

  for (let i = 0; i < ProxyList.length; i++) {
    await deployProxy(hre, LogicName, ProxyList[i]);
  }
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
  const { log, getExtendedArtifact, save } = hre.deployments;
  const { Administrator1, Administrator2 } = await hre.getNamedAccounts();
  const Owners = [Administrator1, Administrator2];
  const targetOwners = ['0xfeaD27a71FDA8458d8b9f9055B50800eCbCaA10e', '0x2Fe8D2Bc3FD37cD7AcbbE668A7a12F957e79D708'];
  const SignRequired = Owners.length;

  //chainlink configure
  const vrfCoordinatorV2Address = '0x6a2aad07396b36fe02a22b33cf443582f682c82f';
  const callbackGasLimit = 2500000;
  const subscribeId = 2387;
  const keyHash = '0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314';
  const requestConfirmations = 3;

  const Logic = await hre.ethers.getContractFactory(LogicName);
  const Proxy = await hre.upgrades.deployProxy(Logic, [
    Owners,
    SignRequired,
    vrfCoordinatorV2Address
  ]);
  await Proxy.deployed();

  if (Proxy.newlyDeployed) {
    log(`contract ${ProxyName} deployed at ${Proxy.address} using ${Proxy.receipt?.gasUsed} gas`);
  }
  const artifact = await getExtendedArtifact(LogicName);
  const proxyDeployments = {
    address: Proxy.address,
    ...artifact,
  };
  await save(ProxyName, proxyDeployments);

  const RaffleBag = <RaffleBag>Proxy;
  const Admin1 = await setupUser(Administrator1, { RaffleBag })
  const Admin2 = await setupUser(Administrator2, { RaffleBag })

  // Set up chainlink
  await Admin1.RaffleBag.setChainlink(callbackGasLimit, subscribeId, keyHash, requestConfirmations);
  log(`Chainlink setup is complete`);

  // Transfer permissions
  await Admin1.RaffleBag.transferOwnership(targetOwners[0]);
  await Admin2.RaffleBag.transferOwnership(targetOwners[1]);
  log(`Permissions are transferred to `, targetOwners[0], targetOwners[1]);
};

export default func;
func.tags = ['RaffleBag'];
