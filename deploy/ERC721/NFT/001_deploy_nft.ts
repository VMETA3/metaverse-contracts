import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const Name = 'VMeta3 NFT';
const Symbol = 'VM3NFT';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy, log} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();
  const LogicName = 'VM3NFTV1';
  const ProxyName = 'Proxy_VMeta3NFT';

  const NFT = await deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (NFT.newlyDeployed) {
    log(`contract Land deployed at ${NFT.address} using ${NFT.receipt?.gasUsed} gas`);
  }

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

  log(`contract ${ProxyName} contract ${ProxyName} deployed at ${Proxy.address} using ${Proxy.receipt?.gasUsed} gas`);

  const artifact = await getExtendedArtifact(LogicName);
  const proxyDeployments = {
    address: Proxy.address,
    ...artifact,
  };
  await save(ProxyName, proxyDeployments);
};

export default func;
func.tags = ['VM3NFT'];
