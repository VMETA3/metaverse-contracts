import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { setupUser } from '../../../test/utils';
import { VM3Elf } from '../../../typechain';
import { getChainlinkConfig } from '../../../utils/chainlink';


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const LogicName = 'VM3Elf';
    const ProxyName = 'Proxy_VM3Elf';

    const LogicContract = await hre.deployments.deploy(LogicName, {
        from: deployer,
        log: true,
        autoMine: true,
    });

    hre.deployments.log(`contract ${LogicName} deployed at ${LogicContract.address}`);

    await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
    const { log, getExtendedArtifact, save } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    const Chainlink = getChainlinkConfig(hre.network.name);
    if (
        Chainlink.linkToken === '' ||
        Chainlink.oracle === '' ||
        Chainlink.jobId === '' ||
        Chainlink.fee === '') {
        log(`contract ${ProxyName} Deployment failed! Check the Chain parameter configuration`);
        return;
    }

    log(`Upgrading ${LogicName} ...`);
    const Proxy = await hre.deployments.get(ProxyName);

    const Logic = await hre.ethers.getContractFactory(LogicName);

    const ProxyInstance = await hre.upgrades.upgradeProxy(Proxy.address, Logic);

    const artifact = await getExtendedArtifact(LogicName);
    const proxyDeployments = {
        address: Proxy.address,
        ...artifact,
    };
    await save(ProxyName, proxyDeployments);
    log("Upgrade succeeded");

    const VM3Elf = <VM3Elf>ProxyInstance;
    const Admin = await setupUser(deployer, { VM3Elf });
    
    // Set up chainlink
    await Admin.VM3Elf.setChainlink(
        hre.ethers.BigNumber.from(Chainlink.requestCount),
        hre.ethers.utils.getAddress(Chainlink.linkToken),
        hre.ethers.utils.getAddress(Chainlink.oracle),
        Chainlink.jobId,
        hre.ethers.utils.parseEther(Chainlink.fee)
    );
    log(`contract ${ProxyName} Chainlink setup is complete`);
};

export default func;
func.tags = ['UpgradeRaffleBag'];
