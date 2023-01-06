import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {log, getExtendedArtifact, save} = hre.deployments;
  const {Administrator1, Administrator2} = await hre.getNamedAccounts();

  const TenVM3 = hre.ethers.BigNumber.from('10000000000000000000');
  const ContractName = 'VM3Elf';
  const ProxyName = 'Proxy_ELF';

  const oldProxy = await hre.deployments.get(ProxyName);

  if (oldProxy.address != '') {
    log(`contract ${ProxyName} deployed at ${oldProxy.address}`);
    return;
  } else {
    const chainId = hre.network.config.chainId; // chain id
    const VM3 = await hre.deployments.get('VM3'); // VMeta3 Token
    const Costs = TenVM3; // Costs
    const Logic = await hre.ethers.getContractFactory(ContractName);
    const Name = 'VMeta3 Elf';
    const Symbol = 'VM3Elf';
    const Owners = [Administrator1, Administrator2];
    const SignRequired = 2;

    const Proxy = await hre.upgrades.deployProxy(Logic, [
      chainId,
      VM3.address,
      Costs,
      Name,
      Symbol,
      Owners,
      SignRequired,
    ]);
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
func.tags = ['Proxy_VM3Elf'];
func.dependencies = ['VM3Elf'];
