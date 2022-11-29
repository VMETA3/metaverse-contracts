import {expect} from '../chai-setup';
import {ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {Land} from '../../typechain';
import {setupUser, setupUsers} from '../utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Land');
  await deployments.fixture('LandV2');
  const {owner, deployer} = await getNamedAccounts();

  const Land = await ethers.getContractFactory('Land');
  const LandProxy = await upgrades.deployProxy(Land, ['VMeta3 Land', 'VMTLAND', owner]);
  await LandProxy.deployed();

  const contracts = {
    Land: <Land>await ethers.getContract('Land'),
    // LandV2: <LandV2>await ethers.getContract("LandV2"),
    Proxy: <Land>LandProxy,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner: await setupUser(owner, contracts),
    deployer: await setupUser(deployer, contracts),
  };
});

describe('Land Token', () => {
  it('basic information', async () => {
    const {Land, Proxy} = await setup();
    expect(await Land.name()).to.be.eq('');
    expect(await Land.symbol()).to.be.eq('');
    expect(await Proxy.name()).to.be.eq('VMeta3 Land');
    expect(await Proxy.symbol()).to.be.eq('VMTLAND');
  });

  it('mint nft', async () => {
    const {Proxy, owner, users} = await setup();
    const to = users[5];
    const BaseURI = '{abc:123,bcd:"string"}';
    await expect(owner.Proxy.awardItem(owner.address, BaseURI))
      .to.emit(Proxy, 'Transfer')
      .withArgs('0x0000000000000000000000000000000000000000', owner.address, 0);
    expect(await Proxy.balanceOf(owner.address)).to.eq(1);
    // expect(await Land.tokenURI(0)).to.string(BaseURI);
    await expect(to.Proxy.awardItem(to.address, BaseURI)).to.be.revertedWith('Ownable: caller is not the owner');

    await owner.Proxy.awardItem(owner.address, BaseURI);
    await expect(owner.Proxy.transferFrom(owner.address, to.address, 1))
      .to.emit(Proxy, 'Transfer')
      .withArgs(owner.address, to.address, 1);
    await expect(owner.Proxy.transferFrom(owner.address, to.address, 1)).to.be.revertedWith(
      'ERC721: caller is not token owner nor approved'
    );

    await owner.Proxy.awardItem(owner.address, BaseURI);
    await expect(owner.Proxy.approve(to.address, 2)).to.emit(Proxy, 'Approval').withArgs(owner.address, to.address, 2);
    await expect(to.Proxy.transferFrom(owner.address, to.address, 2))
      .to.emit(Proxy, 'Transfer')
      .withArgs(owner.address, to.address, 2);
  });

  it('upgrade proxy', async () => {
    const {Proxy, owner, deployer, users} = await setup();
    const to = users[5];
    const BaseURI = '{abc:123,bcd:456}';
    await expect(owner.Proxy.awardItem(owner.address, BaseURI))
      .to.emit(Proxy, 'Transfer')
      .withArgs('0x0000000000000000000000000000000000000000', owner.address, 0);
    expect(await Proxy.balanceOf(owner.address)).to.eq(1);
    await expect(owner.Proxy.transferFrom(owner.address, to.address, 0))
      .to.emit(Proxy, 'Transfer')
      .withArgs(owner.address, to.address, 0);

    // The following process is for testing the upgrade only and has been tested successfully
    // expect(await Proxy.tokenURI(0)).to.eq('');
    // await owner.Proxy.transferOwnership(deployer.address);
    // await expect(await owner.Proxy.transferOwnership(deployer.address))
    //   .to.emit(Proxy, 'OwnershipTransferred')
    //   .withArgs(owner.address, deployer.address);
    // const LandV2 = await ethers.getContract('LandV2');
    // await deployer.Proxy.upgradeTo(LandV2.address);

    expect(await Proxy.tokenURI(0)).to.eq(BaseURI);
  });
});
