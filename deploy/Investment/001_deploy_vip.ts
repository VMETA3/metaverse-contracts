import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { setupUser } from '../../test/utils';
import { Vip } from '../../typechain';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const LogicName = 'Vip';
    const ProxyName = 'Proxy_Vip';

    const Vip = await hre.deployments.deploy(LogicName, {
        from: deployer,
        log: true,
        autoMine: true,
    });

    hre.deployments.log(`contract Vip deployed at ${Vip.address}`);

    await deployProxy(hre, LogicName, ProxyName);
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
    const { log, getExtendedArtifact, save } = hre.deployments;
    const { owner, Administrator1, Administrator2 } = await hre.getNamedAccounts();
    const Owners = [Administrator1, Administrator2, owner];
    const SignRequired = 2;

    const Logic = await hre.ethers.getContractFactory(LogicName);
    const Proxy = await hre.upgrades.deployProxy(Logic, [Owners, SignRequired]);
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
func.tags = ['Vip'];
