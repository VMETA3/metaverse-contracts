import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { Advertise, Settlement, VM3, TestERC20 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Advertise');
  const { deployer, possessor } = await getNamedAccounts();
  const contracts = {
    VM3: <VM3>await ethers.getContract('VM3'),
    Advertise: <Advertise>await ethers.getContract('Advertise'),
    Settlement: <Settlement>await ethers.getContract('Settlement'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    possessor: await setupUser(possessor, contracts),
  };
});

const Name = 'VMeta3 Advertise';
const Symbol = 'VAD';
const Total = 999; // By default, it starts at 0
const URI = '{"test":"test"}';

describe('Advertise Token', () => {
  it('basic information', async () => {
    const { Advertise } = await setup();
    expect(await Advertise.name()).to.be.eq(Name);
    expect(await Advertise.symbol()).to.be.eq(Symbol);
    expect(await Advertise.total()).to.be.eq(Total);
  });
  it('Normal award acceptance process', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User1 = users[1];
    const User2 = users[2];
    const User3 = users[3];
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    const UniversalToken = VM3.address;
    const UniversalAmount = 1;
    const SurpriseToken = VM3.address;
    const SurpriseAmount = 10;

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(UniversalToken, UniversalAmount))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(UniversalToken, UniversalAmount);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(SurpriseToken, SurpriseAmount, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(SurpriseToken, SurpriseAmount, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);
    // Raffle tickets cannot be transferred until the event has started
    await expect(deployer.Advertise.transferFrom(deployer.address, User1.address, 0)).to.be.revertedWith(
      'isActive: Not at the specified time'
    );

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User1.address, 0);
    await deployer.Advertise.transferFrom(deployer.address, User2.address, 1);
    await deployer.Advertise.transferFrom(deployer.address, User3.address, 2);
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    // Collect it for yourself
    await expect(User1.Settlement.universalSettlementERC20(0))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User1.address, VM3.address, 1);
    expect(await VM3.balanceOf(User1.address)).to.be.eq(1);
    expect(await Advertise.balanceOf(User1.address)).to.be.eq(0);
    await expect(Advertise.ownerOf(0)).to.be.revertedWith('ERC721: invalid token ID');

    // Help others collect
    await expect(deployer.Settlement.universalSettlementERC20(1))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User2.address, VM3.address, 1);
    expect(await VM3.balanceOf(User2.address)).to.be.eq(1);

    // Receive super reward
    await expect(deployer.Settlement.luckySettlementERC20(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, UniversalToken, UniversalAmount)
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, SurpriseToken, SurpriseAmount);

    expect(await VM3.balanceOf(User4.address)).to.be.eq(11);
    // The NFT will not be destroyed after receiving the super prize ERC20
    expect(await Advertise.ownerOf(3)).to.be.eq(User4.address);
    expect(await TERC721.ownerOf(0)).to.be.eq(Settlement.address);
    await expect(deployer.Settlement.settlementERC721(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, TERC721.address, 0);
    expect(await TERC721.ownerOf(0)).to.be.eq(User4.address);
    await expect(Advertise.ownerOf(3)).to.be.revertedWith('ERC721: invalid token ID');
  });
  it('Repeated calls settlementERC20', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User1 = users[1];
    const User2 = users[2];
    const User3 = users[3];
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(VM3.address, 1))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(VM3.address, 1);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(VM3.address, 10, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(VM3.address, 10, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);
    // Raffle tickets cannot be transferred until the event has started
    await expect(deployer.Advertise.transferFrom(deployer.address, User1.address, 0)).to.be.revertedWith(
      'isActive: Not at the specified time'
    );

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User1.address, 0);
    await deployer.Advertise.transferFrom(deployer.address, User2.address, 1);
    await deployer.Advertise.transferFrom(deployer.address, User3.address, 2);
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    // Regular user repeated settlement
    await User1.Settlement.universalSettlementERC20(0);
    await expect(User1.Settlement.universalSettlementERC20(0)).to.be.revertedWith('Settlement: the prize has been claimed');

    // Lucky man repeated settlement
    await User4.Settlement.luckySettlementERC20(3);
    await expect(User4.Settlement.luckySettlementERC20(3)).to.be.revertedWith(
      'Settlement: the surprise prize has been claimed'
    );
  });

  it('Should succeed In the case of different tokens, normal award acceptance process', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User1 = users[1];
    const User2 = users[2];
    const User3 = users[3];
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const TERC20 = await TestERC20.deploy();
    await TERC20.deployed();
    const UniversalToken = VM3.address;
    const UniversalAmount = 1;
    const SurpriseToken = TERC20.address;
    const SurpriseAmount = 10;

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(UniversalToken, UniversalAmount))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(UniversalToken, UniversalAmount);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(SurpriseToken, SurpriseAmount, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(SurpriseToken, SurpriseAmount, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC20.transfer(Settlement.address, SurpriseAmount);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);
    // Raffle tickets cannot be transferred until the event has started
    await expect(deployer.Advertise.transferFrom(deployer.address, User1.address, 0)).to.be.revertedWith(
      'isActive: Not at the specified time'
    );

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User1.address, 0);
    await deployer.Advertise.transferFrom(deployer.address, User2.address, 1);
    await deployer.Advertise.transferFrom(deployer.address, User3.address, 2);
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    // Collect it for yourself
    await expect(User1.Settlement.universalSettlementERC20(0))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User1.address, UniversalToken, UniversalAmount);
    expect(await VM3.balanceOf(User1.address)).to.be.eq(1);
    expect(await Advertise.balanceOf(User1.address)).to.be.eq(0);
    await expect(Advertise.ownerOf(0)).to.be.revertedWith('ERC721: invalid token ID');

    // Help others collect
    await expect(deployer.Settlement.universalSettlementERC20(1))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User2.address, UniversalToken, UniversalAmount);
    expect(await VM3.balanceOf(User2.address)).to.be.eq(1);

    // Receive super reward
    await expect(deployer.Settlement.luckySettlementERC20(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, UniversalToken, UniversalAmount)
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, SurpriseToken, SurpriseAmount);

    expect(await VM3.balanceOf(User4.address)).to.be.eq(UniversalAmount);
    expect(await TERC20.balanceOf(User4.address)).to.be.eq(SurpriseAmount);

    // The NFT will not be destroyed after receiving the super prize ERC20
    expect(await Advertise.ownerOf(3)).to.be.eq(User4.address);
    expect(await TERC721.ownerOf(0)).to.be.eq(Settlement.address);
    await expect(deployer.Settlement.settlementERC721(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, TERC721.address, 0);
    expect(await TERC721.ownerOf(0)).to.be.eq(User4.address);
    await expect(Advertise.ownerOf(3)).to.be.revertedWith('ERC721: invalid token ID');
  });

  it('Should failed in the case of different tokens, ordinary user call luckySettlementERC20', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User1 = users[1];
    const User2 = users[2];
    const User3 = users[3];
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const TERC20 = await TestERC20.deploy();
    await TERC20.deployed();
    const UniversalToken = VM3.address;
    const UniversalAmount = 1;
    const SurpriseToken = TERC20.address;
    const SurpriseAmount = 10;

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(UniversalToken, UniversalAmount))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(UniversalToken, UniversalAmount);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(SurpriseToken, SurpriseAmount, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(SurpriseToken, SurpriseAmount, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC20.transfer(Settlement.address, SurpriseAmount);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);
    // Raffle tickets cannot be transferred until the event has started
    await expect(deployer.Advertise.transferFrom(deployer.address, User1.address, 0)).to.be.revertedWith(
      'isActive: Not at the specified time'
    );

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User1.address, 0);
    await deployer.Advertise.transferFrom(deployer.address, User2.address, 1);
    await deployer.Advertise.transferFrom(deployer.address, User3.address, 2);
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    await expect(User1.Settlement.luckySettlementERC20(0))
      .to.be.revertedWith(
        'Settlement: this ticket did not win the grand prize'
      );
  });

  it('Should succeed In the case of different tokens, lucky people call universalSettlementERC20 first, and then luckySettlementERC20', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User1 = users[1];
    const User2 = users[2];
    const User3 = users[3];
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const TERC20 = await TestERC20.deploy();
    await TERC20.deployed();
    const UniversalToken = VM3.address;
    const UniversalAmount = 1;
    const SurpriseToken = TERC20.address;
    const SurpriseAmount = 10;

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(UniversalToken, UniversalAmount))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(UniversalToken, UniversalAmount);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(SurpriseToken, SurpriseAmount, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(SurpriseToken, SurpriseAmount, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC20.transfer(Settlement.address, SurpriseAmount);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);
    // Raffle tickets cannot be transferred until the event has started
    await expect(deployer.Advertise.transferFrom(deployer.address, User1.address, 0)).to.be.revertedWith(
      'isActive: Not at the specified time'
    );

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User1.address, 0);
    await deployer.Advertise.transferFrom(deployer.address, User2.address, 1);
    await deployer.Advertise.transferFrom(deployer.address, User3.address, 2);
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    // Call universalSettlementERC20 first
    await expect(User1.Settlement.universalSettlementERC20(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, UniversalToken, UniversalAmount);
    expect(await VM3.balanceOf(User4.address)).to.be.eq(UniversalAmount);


    // And then call luckySettlementERC20
    await expect(User1.Settlement.luckySettlementERC20(3))
      .to.emit(Settlement, 'Settlement')
      .withArgs(User4.address, SurpriseToken, SurpriseAmount);

    // The prize has been claimed
    expect(await VM3.balanceOf(User4.address)).to.be.eq(UniversalAmount);
    expect(await TERC20.balanceOf(User4.address)).to.be.eq(SurpriseAmount);
  });

  it('Repeated calls settlementERC721', async () => {
    const { deployer, possessor, users, VM3, Advertise, Settlement } = await setup();
    const User4 = users[4];

    // Mint prize
    await deployer.Advertise.batchAwardItem(deployer.address, URI, 4);
    expect(await Advertise.ownerOf(0)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(1)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(2)).to.be.eq(deployer.address);
    expect(await Advertise.ownerOf(3)).to.be.eq(deployer.address);
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const TERC721 = await TestERC721.deploy();
    await TERC721.deployed();
    await TERC721.awardItem(deployer.address, URI);
    expect(await TERC721.ownerOf(0)).to.be.eq(deployer.address);

    // Set up a clearing system
    await deployer.Advertise.setSettlement(Settlement.address);
    // Set the maximum amount a person can hold
    await expect(deployer.Advertise.setCapPerPerson(1)).to.emit(Advertise, 'SetCapPerPerson').withArgs(1);
    // Set up ordinary prizes, public prizes, hold the lottery ticket can be claimed
    await expect(deployer.Advertise.setUniversal(VM3.address, 1))
      .to.emit(Advertise, 'SetUniversal')
      .withArgs(VM3.address, 1);
    // Set up super prize
    await expect(deployer.Advertise.setSurprise(VM3.address, 10, TERC721.address, 0))
      .to.emit(Advertise, 'SetSurprise')
      .withArgs(VM3.address, 10, TERC721.address, 0);
    // Inject prizes into the clearing system
    await possessor.VM3.transfer(Settlement.address, 14);
    await TERC721.transferFrom(deployer.address, Settlement.address, 0);

    const startTime = (await ethers.provider.getBlock("latest")).timestamp;
    const oneDay = 60 * 60 * 24;
    const sevenDay = 60 * 60 * 24 * 7;
    const endTime = startTime + sevenDay;
    // Set activity time
    await expect(deployer.Advertise.setAdTime(startTime, endTime))
      .to.emit(Advertise, 'SetAdTime')
      .withArgs(startTime, endTime);
    // Adjust the time to the activity period
    await ethers.provider.send("evm_mine", [startTime + oneDay]);
    // Distribute raffle tickets to users
    await deployer.Advertise.transferFrom(deployer.address, User4.address, 3);

    // End of activity
    await ethers.provider.send("evm_mine", [endTime]);
    await expect(deployer.Advertise.superLuckyMan(3)).to.emit(Advertise, 'SuperLuckyMan').withArgs(3); // A lucky person is born.

    // Lucky man repeated settlement
    await User4.Settlement.settlementERC721(3);
    await expect(User4.Settlement.settlementERC721(3)).to.be.revertedWith('Settlement: there are no assets to settle');
  });
});
