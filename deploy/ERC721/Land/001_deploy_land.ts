import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const Name = 'VMeta3 Land';
const Symbol = 'VM3Land';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();
  const LogicName = 'Land';
  const ProxyName = 'Proxy_Land';

  await deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
  const {log, getExtendedArtifact, save} = hre.deployments;
  const {Administrator1, Administrator2, owner} = await hre.getNamedAccounts();
  const Owners = [Administrator1, Administrator2, owner];
  const SignRequired = 2;

  const Logic = await hre.ethers.getContractFactory(LogicName);
  const Proxy = await hre.upgrades.deployProxy(Logic, [Name, Symbol, Owners, SignRequired]);
  await Proxy.deployed();

  log(`contract ${ProxyName} deployed at ${Proxy.address} using ${Proxy.receipt?.gasUsed} gas`);

  const artifact = await getExtendedArtifact(LogicName);
  const proxyDeployments = {
    address: Proxy.address,
    ...artifact,
  };
  await save(ProxyName, proxyDeployments);
};
export default func;
func.tags = ['VMTLand'];
