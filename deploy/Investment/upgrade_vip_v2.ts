import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const LogicName = 'VipV2';
const ProxyName = 'Proxy_Vip';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();

    const VipV2 = await hre.deployments.deploy(LogicName, {
        from: deployer,
        log: true,
        autoMine: true,
    });

    hre.deployments.log(`contract Vip deployed at ${VipV2.address}`);

    await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
    const { log, getExtendedArtifact, save } = hre.deployments;
       console.log("Upgrading Vip...");
    const Proxy = await hre.deployments.get(ProxyName);

    const VipV2 = await hre.ethers.getContractFactory(LogicName);

    await hre.upgrades.upgradeProxy(Proxy.address, VipV2);

    const artifact = await getExtendedArtifact(LogicName);
    const proxyDeployments = {
        address: Proxy.address,
        ...artifact,
    };
    await save(ProxyName, proxyDeployments);
    console.log("Upgrade succeeded");
};

export default func;
func.tags = ['VipV2'];
