import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const Name = 'VMeta3 Elf';
const Symbol = 'VM3Elf';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deploy, log} = hre.deployments;
  const {deployer} = await hre.getNamedAccounts();
  const LogicName = 'VM3Elf';
  const ProxyName = 'Proxy_VM3Elf';

  const Elf = await deploy(LogicName, {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });
  if (Elf.newlyDeployed) {
    log(`contract Land deployed at ${Elf.address} using ${Elf.receipt?.gasUsed} gas`);
  }

  await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
  const {log, getExtendedArtifact, save} = hre.deployments;
  const {Administrator1, Administrator2, owner, deployer} = await hre.getNamedAccounts();
  const Owners = [Administrator1, Administrator2, owner, deployer];
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
func.tags = ['VM3Elf'];
