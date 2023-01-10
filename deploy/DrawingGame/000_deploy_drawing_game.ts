import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {setupUser} from '../../test/utils';
import {DrawingGame} from '../../typechain';
import {getChainlinkConfig} from '../../utils/chainlink';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();
  const LogicName = 'DrawingGame';
  const ProxyName = 'Proxy_DrawingGame';

  const DrawingGame = await hre.deployments.deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true,
  });

  hre.deployments.log(`contract DrawingGame deployed at ${DrawingGame.address}`);

  await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
  const {log, getExtendedArtifact, save} = hre.deployments;
  const {owner, Administrator1, Administrator2} = await hre.getNamedAccounts();
  const Owners = [Administrator1, Administrator2, owner];
  const SignRequired = 2;

  //chainlink configure
  const Chainlink = getChainlinkConfig(hre.network.name);
  if (
    Chainlink.contract === '' ||
    Chainlink.gasLimit === '' ||
    Chainlink.subscribeId === '' ||
    Chainlink.keyHash === '' ||
    Chainlink.requestConfirmations === ''
  ) {
    log(`contract ${ProxyName} Deployment failed! Check the Chain parameter configuration`);
    return;
  }

  const Logic = await hre.ethers.getContractFactory(LogicName);
  const Proxy = await hre.upgrades.deployProxy(Logic, [Owners, SignRequired, Chainlink.contract]);
  await Proxy.deployed();
  log(`contract ${ProxyName} deployed at ${Proxy.address} using ${Proxy.receipt?.gasUsed} gas`);

  const artifact = await getExtendedArtifact(LogicName);
  const proxyDeployments = {
    address: Proxy.address,
    ...artifact,
  };
  await save(ProxyName, proxyDeployments);

  const P = <DrawingGame>Proxy;
  const Admin = await setupUser(owner, {P});

  // Set up chainlink
  await Admin.P.setChainlink(
    hre.ethers.BigNumber.from(Chainlink.gasLimit),
    hre.ethers.BigNumber.from(Chainlink.subscribeId),
    Chainlink.keyHash,
    hre.ethers.BigNumber.from(Chainlink.requestConfirmations)
  );
  log(`contract ${ProxyName} Chainlink setup is complete`);
};

export default func;
func.tags = ['DrawingGame'];
