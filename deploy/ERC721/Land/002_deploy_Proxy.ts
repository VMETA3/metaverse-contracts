import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log, getExtendedArtifact, save} = hre.deployments;
  const {Administrator1, Administrator2} = await hre.getNamedAccounts();

  const ContractName = 'Land';
  const ProxyName = 'Proxy_Land';

  const oldProxy = await hre.deployments.get(ProxyName);

  if (oldProxy.address != '') {
    log(`contract ${ProxyName} deployed at ${oldProxy.address}`);
    return;
  } else {
    const chainId = hre.network.config.chainId; // chain id
    const Logic = await hre.ethers.getContractFactory(ContractName);
    const Name = 'VMeta3 Land';
    const Symbol = 'VM3LAND';
    const Owners = [Administrator1, Administrator2];
    const SignRequired = 2;

    const Proxy = await hre.upgrades.deployProxy(Logic, [chainId, Name, Symbol, Owners, SignRequired]);
    await Proxy.deployed();

    if (Proxy.newlyDeployed) {
      log(`contract ${ProxyName} deployed at ${Proxy.address} using ${Proxy.receipt?.gasUsed} gas`);
    }
    const artifact = await getExtendedArtifact(ContractName);
    const proxyDeployments = {
      address: Proxy.address,
      ...artifact,
    };
    await save(ProxyName, proxyDeployments);
  }
};
export default func;
func.tags = ['Proxy_VM3Land'];
func.dependencies = ['VM3Land'];
