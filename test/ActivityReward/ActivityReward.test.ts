import {expect} from '../chai-setup';
import {ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts, network} from 'hardhat';
import {VM3, ActivityReward, VRFCoordinatorV2Mock} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('ActivityReward');
  await deployments.fixture('VM3');
  const {possessor, Administrator1, Administrator2} = await getNamedAccounts();

  const ActivityReward = await ethers.getContractFactory('ActivityReward');
  const VM3 = await deployments.get('VM3'); // VMeta3 Token
  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory('VRFCoordinatorV2Mock');
  const VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(1, 1);
  const VRFCoordinatorV2MockInstance = <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock;
  await VRFCoordinatorV2MockInstance.createSubscription();

  const chainId = network.config.chainId; // chain id
  const signRequired = 2;
  const owners = [Administrator1, Administrator2];

  const ActivityRewardProxy = await upgrades.deployProxy(ActivityReward, [
    VM3.address,
    possessor,
    chainId,
    owners,
    signRequired,
    VRFCoordinatorV2Mock.address,
  ]);
  await ActivityRewardProxy.deployed();

  //chainlink add the consumer
  await VRFCoordinatorV2MockInstance.addConsumer(1, ActivityRewardProxy.address);

  const contracts = {
    VM3: <VM3>await ethers.getContract('VM3'),
    ActivityReward: <ActivityReward>await ethers.getContract('ActivityReward'),
    Proxy: <ActivityReward>ActivityRewardProxy,
    VRFCoordinatorV2Mock: <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
    possessor: await setupUser(possessor, contracts),
  };
});

describe('ActivityReward', () => {
  describe('Proxy information', async () => {
    it('The logical contract data is empty', async () => {
      const {ActivityReward} = await setup();
      expect(await ActivityReward.VM3()).to.be.eq('0x0000000000000000000000000000000000000000');
    });
    it('The agent contract has the correct information', async () => {
      const {Proxy, possessor, Administrator1, Administrator2, VM3} = await setup();
      expect(await Proxy.VM3()).to.be.eq(VM3.address);
      const Owners = await Proxy.owners();
      expect(Owners.length).to.be.eq(6);
      expect(Owners[1]).to.be.eq(Administrator1.address);
      expect(Owners[2]).to.be.eq(Administrator2.address);
      expect(await Proxy.VM3()).to.be.eq(VM3.address);
      expect(await Proxy.Spender()).to.be.eq(possessor.address);
    });
  });

  describe('Instant rewards', async () => {
    it('It should succeed in getFreeReward', async () => {
      const {possessor, users, Administrator1, Administrator2, Proxy} = await setup();
      const User = users[8];
      const nonce = 0;
      const OneVM3 = ethers.utils.parseEther('1');
      await possessor.VM3.approve(Proxy.address, OneVM3);
      const Reward = ethers.utils.parseEther('0.5');

      // Regular injection of active values
      await expect(User.Proxy.getFreeReward(nonce)).to.revertedWith('SafeOwnableUpgradeable: operation not in pending');
      const FreeRewardHash = await User.Proxy.getFreeRewardHash(User.address, nonce);
      const FreeRewardHashBytes = web3.utils.hexToBytes(FreeRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(FreeRewardHashBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(FreeRewardHashBytes));
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await User.Proxy.HashToSign(FreeRewardHash)),
        [Sig1, Sig2]
      );
      await expect(Administrator1.Proxy.getFreeReward(nonce)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );
      await expect(User.Proxy.getFreeReward(nonce)).to.emit(Proxy, 'GetReward').withArgs(User.address, Reward);
    });

    it('It should succeed in getMultipleReward', async () => {
      const {possessor, users, Administrator1, Administrator2, Proxy, VRFCoordinatorV2Mock} = await setup();
      await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);
      const User = users[8];
      const nonce = 0;
      const OneVM3 = ethers.utils.parseEther('1');
      await possessor.VM3.approve(Proxy.address, OneVM3);

      await possessor.VM3.transfer(User.address, OneVM3);
      await User.VM3.approve(Proxy.address, OneVM3);

      const MultipleRewardHash = await Proxy.getMultipleRewardHash(User.address, nonce);
      const MultipleRewardHashToBytes = web3.utils.hexToBytes(MultipleRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(MultipleRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(MultipleRewardHashToBytes));
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await User.Proxy.HashToSign(MultipleRewardHash)),
        [Sig1, Sig2]
      );
      await User.Proxy.getMultipleReward(nonce);
      expect(await VRFCoordinatorV2Mock.s_nextRequestId()).to.be.equal(2);

      const num = ethers.BigNumber.from('1237645192312354321');
      await expect(VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(1, Proxy.address, [num]))
        .to.be.emit(VRFCoordinatorV2Mock, 'RandomWordsFulfilled')
        .withArgs(1, 1, 0, true);
      expect(await User.VM3.balanceOf(User.address)).to.be.equal(ethers.BigNumber.from('1750000000000000000'));
    });
  });

  describe('Slowly release reward', async () => {
    const SecondsForDay = 60 * 60 * 24;
    const SecondsForMonth = SecondsForDay * 30;

    it('The injection pool needs to be released once', async () => {
      const {possessor, Proxy, users, Administrator1, Administrator2} = await setup();
      const User = users[8];
      const nonce = 0;
      const OnehundredVM3 = ethers.utils.parseEther('100');
      const FiveVM3 = ethers.utils.parseEther('5');

      await possessor.VM3.approve(Proxy.address, OnehundredVM3);

      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, OnehundredVM3, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));

      // Verify unauthorized transactions
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredVM3, nonce)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

      // injectReleaseReward
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredVM3, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, OnehundredVM3)
        .to.emit(Proxy, 'WithdrawReleasedReward')
        .withArgs(User.address, FiveVM3);
    });

    it('Release 10%', async () => {
      const {possessor, Proxy, users, Administrator1, Administrator2} = await setup();
      const User = users[8];
      const nonce = 0;
      const OnehundredVM3 = ethers.utils.parseEther('100');
      // const FiveVM3 = OnehundredVM3.div(20);
      const NinetyPointFiveVM3 = OnehundredVM3.sub(5).div(10);

      await possessor.VM3.approve(Proxy.address, OnehundredVM3);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, OnehundredVM3, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      // InjectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredVM3, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, OnehundredVM3);

      // Non-existent user
      expect(await User.Proxy.checkReleased()).to.be.eq(ethers.BigNumber.from('0'));

      // Not released now
      expect(await User.Proxy.checkReleased()).to.be.eq(ethers.BigNumber.from('0'));

      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      expect(await User.Proxy.checkReleased()).to.be.eq(NinetyPointFiveVM3);
    });

    it('When the number of releases is less than 5, release 5', async () => {
      const {possessor, Proxy, users, Administrator1, Administrator2} = await setup();
      const User = users[8];
      const nonce = 0;
      const FortyFiveVM3 = ethers.utils.parseEther('45');
      const FiveVM3 = ethers.utils.parseEther('5');
      await possessor.VM3.approve(Proxy.address, FortyFiveVM3);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, FortyFiveVM3, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      // InjectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(User.Proxy.injectReleaseReward(User.address, FortyFiveVM3, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, FortyFiveVM3);
      // next month
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      expect(await User.Proxy.checkReleased()).to.be.eq(FiveVM3);
    });

    it('When the pool not enough 5, release all', async () => {
      const {possessor, Proxy, users, Administrator1, Administrator2} = await setup();
      const User = users[8];
      const nonce = 0;
      const fourVM3 = ethers.utils.parseEther('4');

      await possessor.VM3.transfer(Administrator1.address, fourVM3);
      await Administrator1.VM3.approve(Proxy.address, fourVM3);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, fourVM3, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sign = [Sig1, Sig2];
      // injectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, Sign);
      await expect(User.Proxy.injectReleaseReward(User.address, fourVM3, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, fourVM3);
      // next month
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      expect(await User.Proxy.checkReleased()).to.be.eq(fourVM3);
    });
  });
});
