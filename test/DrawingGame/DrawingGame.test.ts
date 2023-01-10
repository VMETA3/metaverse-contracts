import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, network, upgrades} from 'hardhat';
import {setupUser, setupUsers} from '../utils';
import {DrawingGame, InvestmentMock, VRFCoordinatorV2Mock, GameItem} from '../../typechain';
import {time} from '@nomicfoundation/hardhat-network-helpers';

const zeroAddress = ethers.constants.AddressZero;

const setup = deployments.createFixture(async () => {
  await deployments.fixture('DrawingGame');
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();
  const owners = [Administrator1, Administrator2];

  const GameItemFactory = await ethers.getContractFactory('GameItem');
  const GameItem = await GameItemFactory.deploy();

  const InvestmentMockFactory = await ethers.getContractFactory('InvestmentMock');
  const InvestmentMock = await InvestmentMockFactory.deploy(zeroAddress, zeroAddress, 1672501705, 1704037705);

  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory('VRFCoordinatorV2Mock');
  const VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(1, 1);

  const VRFCoordinatorV2MockInstance = <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock;
  await VRFCoordinatorV2MockInstance.createSubscription();

  const DrawingGame = await ethers.getContractFactory('DrawingGame');
  const DrawingGameProxy = await upgrades.deployProxy(DrawingGame, [owners, 2, VRFCoordinatorV2Mock.address]);
  await DrawingGameProxy.deployed();

  //chainlink add the consumer
  await VRFCoordinatorV2MockInstance.addConsumer(1, DrawingGameProxy.address);

  const contracts = {
    Investment: <InvestmentMock>InvestmentMock,
    VRFCoordinatorV2: <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock,
    Proxy: <DrawingGame>DrawingGameProxy,
    GameItem: <GameItem>GameItem,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
  };
});

describe('DrawingGame contract', function () {
  it('simple draw', async () => {
    const {Proxy, Investment, Administrator1, users, VRFCoordinatorV2, GameItem} = await setup();
    await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);
    await Administrator1.Proxy.setInvestment(Investment.address);
    expect(await Proxy.investmentAddress()).to.be.eq(Investment.address);

    const user0 = users[0];
    for (let i = 0; i < 10; i++) {
      // Add investor
      const amount = ethers.utils.parseEther('100');
      await expect(users[i].Investment.deposit(amount))
        .to.be.emit(Investment, 'Deposit')
        .withArgs(users[i].address, amount);
      expect(await users[i].Investment.getLevel(0)).to.be.eq(1);
    }

    await Administrator1.GameItem.setApprovalForAll(Proxy.address, true);
    const depositTotalNFT = 100;
    for (let i = 0; i < depositTotalNFT; i++) {
      await GameItem.awardItem(Administrator1.address, '');
      expect(await GameItem.ownerOf(i)).to.be.eq(Administrator1.address);
      await Administrator1.Proxy.depositNFTs([GameItem.address], [i]);
    }
    expect(await Proxy.getTotalNFT()).to.be.eq(depositTotalNFT);

    // Draw
    // modify network block timestamp
    const lastTime = await time.latest();
    await Administrator1.Proxy.setStartTime(lastTime);
    await Administrator1.Proxy.setEndTime(lastTime + 24 * 60 * 60 * 180);
    await network.provider.send('evm_setNextBlockTimestamp', [1677402600]); //FIXME
    await Administrator1.Proxy.requestRandomWordsForDraw();
    expect(await VRFCoordinatorV2.s_nextRequestId()).to.be.equal(2);
    const arr: number[] = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ];
    await expect(VRFCoordinatorV2.fulfillRandomWordsWithOverride(1, Proxy.address, arr))
      .to.be.emit(VRFCoordinatorV2, 'RandomWordsFulfilled')
      .withArgs(1, 1, 0, true);

    expect(await Proxy.distributedNFTs()).to.be.eq(10);

    const user0NFT = await Proxy.wonNFT(user0.address);
    expect(user0NFT.tokenId).to.be.eq(0);

    const newBlockTimeStamp = 1677402600 + 10 + 24 * 60 * 60 * 7;
    await network.provider.send('evm_setNextBlockTimestamp', [newBlockTimeStamp]); //FIXME
    await expect(Administrator1.Proxy.drawByManager([user0.address]))
      .to.be.emit(Proxy, 'Draw')
      .withArgs(Administrator1.address, newBlockTimeStamp, 1);

    await Administrator1.Proxy.withdrawNFTs(100, Administrator1.address);
    expect(await Proxy.getTotalNFT()).to.be.eq(11);
  });
});
