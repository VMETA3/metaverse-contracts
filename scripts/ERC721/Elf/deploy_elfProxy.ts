import {deployments, getNamedAccounts, ethers, network, upgrades} from 'hardhat';

async function main() {
  console.log('deploy Elf proxy ...');
  const {log} = deployments;
  const {Administrator1, Administrator2} = await getNamedAccounts();

  // VMeta3 Elf initialize
  const chainId = network.config.chainId; // chain id
  const VM3 = await deployments.get('VM3'); // VMeta3 Token
  console.log('VM3', VM3);
  const Costs = ethers.BigNumber.from('10000000000000000000'); // Costs
  const Name = 'VMeta3 Elf';
  const Symbol = 'VM3Elf';
  const owners = [Administrator1, Administrator2];
  const signRequired = 2;

  const Elf = await ethers.getContractFactory('VM3Elf');
  const ElfProxy = await upgrades.deployProxy(Elf, [chainId, VM3.address, Costs, Name, Symbol, owners, signRequired]);
  // await ElfProxy.deployed();

  if (ElfProxy.newlyDeployed) {
    log(`contract ElfProxy deployed at ${ElfProxy.address} using ${ElfProxy.receipt?.gasUsed} gas`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
