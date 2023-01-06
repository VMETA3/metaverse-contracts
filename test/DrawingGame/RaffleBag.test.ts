import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts, network, upgrades } from 'hardhat';
import { setupUser, setupUsers } from '../utils';
import { RaffleBag, VRFCoordinatorV2Mock, GameItem, VM3 } from '../../typechain';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import web3 from 'web3';

const zeroAddress = ethers.constants.AddressZero;

const setup = deployments.createFixture(async () => {
  await deployments.fixture('RaffleBag');
  const { deployer, possessor, Administrator1, Administrator2 } = await getNamedAccounts();
  const owners = [Administrator1, Administrator2];

  const GameItemFactory = await ethers.getContractFactory('GameItem');
  const BCard = await GameItemFactory.deploy();
  const CCard = await GameItemFactory.deploy();

  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory('VRFCoordinatorV2Mock');
  const VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(1, 1);

  const VRFCoordinatorV2MockInstance = <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock;
  await VRFCoordinatorV2MockInstance.createSubscription();

  const VM3 = await ethers.getContract('VM3');

  const RaffleBag = await ethers.getContractFactory('RaffleBag');

  const RaffleBagProxy = await upgrades.deployProxy(RaffleBag, [
    possessor,
    VM3.address,
    BCard.address,
    CCard.address,
    owners,
    2,
    VRFCoordinatorV2Mock.address
  ]);

  await RaffleBagProxy.deployed();

  //chainlink add the consumer
  await VRFCoordinatorV2MockInstance.addConsumer(1, RaffleBagProxy.address);

  const contracts = {
    VRFCoordinatorV2Mock: <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock,
    Proxy: <RaffleBag>RaffleBagProxy,
    BCard: <GameItem>BCard,
    CCard: <GameItem>CCard,
    VM3: <VM3>VM3,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    possessor: await setupUser(possessor, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
  };
});

describe('RaffleBag contract', function () {
  it('Simple draw, win a BCard', async () => {
    const { Proxy, possessor, Administrator1, Administrator2, deployer, users, VRFCoordinatorV2Mock } = await setup();
    const User = users[0];
    const nonce = 0;
    for (let i = 0;i <6;i++) {
      await possessor.BCard.awardItem(possessor.address, "B"+i);
      await possessor.BCard.approve(Proxy.address, i);
    }

    await Administrator1.Proxy.setChainlink(2500000000, 1, ethers.constants.HashZero, 3);

    const DrawHash = await Proxy.drawHash(User.address, nonce);
    const DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
    const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
    const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));

    // Verify unauthorized transactions
    await expect(User.Proxy.draw(User.address, nonce)).to.revertedWith(
      'SafeOwnableUpgradeable: operation not in pending'
    );

    const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
    await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

    // draw
    await User.Proxy.draw(User.address, nonce);
    expect(await VRFCoordinatorV2Mock.s_nextRequestId()).to.be.equal(2);
    const num = ethers.BigNumber.from('66412');
    await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(1, Proxy.address, [num]);
    // win a BCard
    expect((await User.BCard.balanceOf(User.address))).to.be.equal(1);
  })

  it('Simple draw, win a CCard', async () => {
    const { Proxy, possessor, Administrator1, Administrator2, deployer, users, VRFCoordinatorV2Mock } = await setup();
    const User = users[0];
    const nonce1 = 1;
    const nonce2 = 2;
    for (let i = 0; i < 15; i++) {
      await possessor.CCard.awardItem(possessor.address, "C" + i);
      await possessor.CCard.approve(Proxy.address, i);
    }

    await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);

    // draw first time
    let DrawHash = await Proxy.drawHash(User.address, nonce1);
    let DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
    let Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
    let Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));
    let sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
    await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

    await User.Proxy.draw(User.address, nonce1);

    let num = ethers.BigNumber.from(66412 + 4); // 66416 % 66412 = 4
    await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(1, Proxy.address, [num]);

    expect((await User.CCard.balanceOf(User.address))).to.be.equal(1);

    // draw second time
    DrawHash = await Proxy.drawHash(User.address, nonce2);
    DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
    Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
    Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));
    sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
    await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

    await User.Proxy.draw(User.address, nonce2);

    num = ethers.BigNumber.from(66412 + 11);
    await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(2, Proxy.address, [num]);

    expect((await User.CCard.balanceOf(User.address))).to.be.equal(2);
  })

  it('Simple draw, win 0.8 VM3', async () => {
    const { Proxy, possessor, Administrator1, Administrator2, deployer, users, VRFCoordinatorV2Mock } = await setup();
    const User = users[0];
    const nonce1 = 1;
    const nonce2 = 2;
    await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);
    await possessor.VM3.approve(Proxy.address, ethers.utils.parseEther("1.6"));


    // draw first time
    let DrawHash = await Proxy.drawHash(User.address, nonce1);
    let DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
    let Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
    let Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));
    let sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
    await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

    await User.Proxy.draw(User.address, nonce1);
    let num = ethers.BigNumber.from(412); // % 412
    await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(1, Proxy.address, [num]);

    expect((await User.VM3.balanceOf(User.address))).to.be.equal(ethers.utils.parseEther("0.8"));

    // draw second time
    DrawHash = await Proxy.drawHash(User.address, nonce2);
    DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
    Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
    Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));
    sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
    await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

    await User.Proxy.draw(User.address, nonce2);

    num = ethers.BigNumber.from(6411);// % 6411
    await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(2, Proxy.address, [num]);

    expect((await User.VM3.balanceOf(User.address))).to.be.equal(ethers.utils.parseEther("1.6"));
  })

  it('Draw all BCard', async () => {
    const { Proxy, possessor, Administrator1, Administrator2, deployer, users, VRFCoordinatorV2Mock } = await setup();
    const User = users[0];
    for (let i = 0;i <6;i++) {
      await possessor.BCard.awardItem(possessor.address, "B"+i);
      await possessor.BCard.approve(Proxy.address, i);
    }

    await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);

    // draw all BCard
    for (let i = 0; i < 6; i++) {
      const nonce = i;
      const DrawHash = await Proxy.drawHash(User.address, nonce);
      const DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));

      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

      await User.Proxy.draw(User.address, nonce);

      const num = ethers.BigNumber.from('66412');
      await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(i + 1, Proxy.address, [num]);
      expect((await User.Proxy.totalNumberOfBCard())).to.be.equal(5 - i);

    }
    expect(((await User.Proxy.getPrizePool())).toString()).to.be.equal('1,1,8,2,1,400,3,800000000000000000,6000,3,600000000000000000,12000,3,300000000000000000,18000,3,200000000000000000,30000');
  })

  it('Draw all CCard', async () => {
    const { Proxy, possessor, Administrator1, Administrator2, deployer, users, VRFCoordinatorV2Mock } = await setup();
    const User = users[0];
    for (let i = 0; i < 15; i++) {
      await possessor.CCard.awardItem(possessor.address, "C" + i);
      await possessor.CCard.approve(Proxy.address, i);
    }

    await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);

    // draw all CCard
    for (let i = 0; i < 15; i++) {
      const nonce = i;
      const DrawHash = await Proxy.drawHash(User.address, nonce);
      const DrawHashToBytes = web3.utils.hexToBytes(DrawHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(DrawHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(DrawHashToBytes));

      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(DrawHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

      await User.Proxy.draw(User.address, nonce);

      const num = ethers.BigNumber.from('66417');
      await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(i + 1, Proxy.address, [num]);

      expect((await User.Proxy.totalNumberOfCCard())).to.be.equal(14 - i);

    }
    expect(((await User.Proxy.getPrizePool())).toString()).to.be.equal('0,1,4,2,1,400,3,800000000000000000,6000,3,600000000000000000,12000,3,300000000000000000,18000,3,200000000000000000,30000');
  })
})
