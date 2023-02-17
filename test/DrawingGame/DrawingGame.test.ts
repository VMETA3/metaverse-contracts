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

    const totalParticipants = 10;
    for (let i = 0; i < totalParticipants; i++) {
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
    await Administrator1.Proxy.setEndTime(lastTime + 24 * 60 * 60 * 180);
    await Administrator1.Proxy.setStartTime(lastTime);
    await network.provider.send('evm_setNextBlockTimestamp', [1677402600]); //FIXME
    await Administrator1.Proxy.requestRandomWordsForDraw(2);
    expect(await VRFCoordinatorV2.s_nextRequestId()).to.be.equal(2);
    const arr: number[] = [1, 1];
    await expect(VRFCoordinatorV2.fulfillRandomWordsWithOverride(1, Proxy.address, arr))
      .to.be.emit(Proxy, 'Draw')
      .withArgs(
        VRFCoordinatorV2.address,
        [users[0].address, users[1].address],
        [GameItem.address, GameItem.address],
        [0, 1],
        1
      );

    expect(await Proxy.distributedNFTs()).to.be.eq(2);

    for (let i = 0; i < 2; i++) {
      expect(await GameItem.ownerOf(i)).to.be.eq(users[i].address);
      expect(await Proxy.won(users[i].address)).to.be.eq(true);
    }

    await Administrator1.Proxy.withdrawNFTs(100, users[10].address);
    expect(await Proxy.getTotalNFT()).to.be.eq(2);
    for (let i = 2; i < 100; i++) {
      expect(await GameItem.ownerOf(i)).to.be.eq(users[10].address);
    }
  });
});
