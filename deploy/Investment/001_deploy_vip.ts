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

    const proxy = await hre.deployments.getOrNull(ProxyName);
    if (!proxy) {
        await deployProxy(hre, LogicName, ProxyName);
    } else {
        hre.deployments.log(`reusing "${ProxyName}" at ${proxy.address}`);
        hre.deployments.log(`contract ${ProxyName} deployed at ${proxy.address}`);
    }
};

const deployProxy = async function (hre: HardhatRuntimeEnvironment, LogicName: string, ProxyName: string) {
    const { log, getExtendedArtifact, save } = hre.deployments;
    const { owner, Administrator1, Administrator2 } = await hre.getNamedAccounts();
    const Owners = [Administrator1, Administrator2, owner];
    const targetOwners = ['0xfeaD27a71FDA8458d8b9f9055B50800eCbCaA10e', '0x2Fe8D2Bc3FD37cD7AcbbE668A7a12F957e79D708'];
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

    const Vip = <Vip>Proxy;
    const Admin1 = await setupUser(Administrator1, { Vip })
    const Admin2 = await setupUser(Administrator2, { Vip })

    // Transfer permissions
    await Admin1.Vip.transferOwnership(targetOwners[0]);
    await Admin2.Vip.transferOwnership(targetOwners[1]);
    log(`Permissions are transferred to `, targetOwners[0], targetOwners[1]);
};

export default func;
func.tags = ['Vip'];
