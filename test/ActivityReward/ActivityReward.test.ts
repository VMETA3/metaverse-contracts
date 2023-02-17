import { expect } from '../chai-setup';
import { ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts, network } from 'hardhat';
import { TestERC20, ActivityReward, VRFCoordinatorV2Mock } from '../../typechain';
import { setupUser, setupUsers } from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('ActivityReward');
  await deployments.fixture('TestERC20');
  const { deployer, Administrator1, Administrator2 } = await getNamedAccounts();

  const ActivityReward = await ethers.getContractFactory('ActivityReward');
  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory('VRFCoordinatorV2Mock');
  const VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(1, 1);
  const VRFCoordinatorV2MockInstance = <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock;
  await VRFCoordinatorV2MockInstance.createSubscription();

  const signRequired = 2;
  const owners = [Administrator1, Administrator2];

  const ActivityRewardProxy = await upgrades.deployProxy(ActivityReward, [
    owners,
    signRequired,
    VRFCoordinatorV2Mock.address,
  ]);
  await ActivityRewardProxy.deployed();

  //chainlink add the consumer
  await VRFCoordinatorV2MockInstance.addConsumer(1, ActivityRewardProxy.address);

  const contracts = {
    ERC20Token: <TestERC20>await ethers.getContract('TestERC20'),
    ActivityReward: <ActivityReward>await ethers.getContract('ActivityReward'),
    Proxy: <ActivityReward>ActivityRewardProxy,
    VRFCoordinatorV2Mock: <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock,
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

describe('ActivityReward', () => {
  describe('Proxy information', async () => {
    it('The logical contract data is empty', async () => {
      const { ActivityReward } = await setup();
      expect(await ActivityReward.ERC20Token()).to.be.eq('0x0000000000000000000000000000000000000000');
    });
    it('The agent contract has the correct information', async () => {
      const { Proxy, deployer, Administrator1, Administrator2, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      expect(await Proxy.ERC20Token()).to.be.eq(ERC20Token.address);
      const Owners = await Proxy.owners();
      expect(Owners.length).to.be.eq(6);
      expect(Owners[1]).to.be.eq(Administrator1.address);
      expect(Owners[2]).to.be.eq(Administrator2.address);
      expect(await Proxy.ERC20Token()).to.be.eq(ERC20Token.address);
      expect(await Proxy.Spender()).to.be.eq(deployer.address);
    });
  });

  describe('Instant rewards', async () => {
    it('It should succeed in getFreeReward', async () => {
      const { deployer, users, Administrator1, Administrator2, Proxy, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const OneToken = ethers.utils.parseEther('1');
      await deployer.ERC20Token.approve(Proxy.address, OneToken);
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
      const { deployer, users, Administrator1, Administrator2, Proxy, VRFCoordinatorV2Mock, ERC20Token } = await setup();
      await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const OneToken = ethers.utils.parseEther('1');
      await deployer.ERC20Token.approve(Proxy.address, OneToken);

      await deployer.ERC20Token.transfer(User.address, OneToken);
      await User.ERC20Token.approve(Proxy.address, OneToken);

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
      expect(await User.ERC20Token.balanceOf(User.address)).to.be.equal(ethers.BigNumber.from('1800000000000000000'));
    });
  });

  describe('Slowly release reward', async () => {
    const SecondsForDay = 60 * 60 * 24;
    const SecondsForMonth = SecondsForDay * 30;

    it('The injection pool needs to be released once', async () => {
      const { deployer, Proxy, ERC20Token, users, Administrator1, Administrator2 } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const OnehundredToken = ethers.utils.parseEther('100');
      const FiveToken = ethers.utils.parseEther('5');

      await deployer.ERC20Token.approve(Proxy.address, OnehundredToken);

      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, OnehundredToken, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));

      // Verify unauthorized transactions
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredToken, nonce)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);

      // injectReleaseReward
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredToken, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, OnehundredToken)
        .to.emit(Proxy, 'WithdrawReleasedReward')
        .withArgs(User.address, FiveToken);
    });

    it('Release 10%', async () => {
      const { deployer, Proxy, users, Administrator1, Administrator2, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const OnehundredToken = ethers.utils.parseEther('100');
      const NinetyPointFiveToken = ethers.utils.parseEther('9.5');

      await deployer.ERC20Token.approve(Proxy.address, OnehundredToken);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, OnehundredToken, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      // InjectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredToken, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, OnehundredToken);

      // Non-existent user
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(ethers.BigNumber.from('0'));

      // Not released now
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(ethers.BigNumber.from('0'));

      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await deployer.ERC20Token.approve(Proxy.address, OnehundredToken);
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(NinetyPointFiveToken);
    });

    it('When the number of releases is less than 5, release 5', async () => {
      const { deployer, Proxy, users, Administrator1, Administrator2, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const FortyFiveToken = ethers.utils.parseEther('45');
      const FiveToken = ethers.utils.parseEther('5');
      await deployer.ERC20Token.approve(Proxy.address, FortyFiveToken);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, FortyFiveToken, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      // InjectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(User.Proxy.injectReleaseReward(User.address, FortyFiveToken, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, FortyFiveToken);

      // next month
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await deployer.ERC20Token.approve(Proxy.address, FortyFiveToken);
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(FiveToken);
    });

    it('When the pool not enough 5, release all', async () => {
      const { deployer, Proxy, users, Administrator1, Administrator2, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const fourToken = ethers.utils.parseEther('4');
      const threePointEightToken = ethers.utils.parseEther('3.8');
      await deployer.ERC20Token.approve(Proxy.address, fourToken);

      // User
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, fourToken, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      // injectReleaseReward to User
      const sendHash = web3.utils.hexToBytes(await Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(User.Proxy.injectReleaseReward(User.address, fourToken, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, fourToken);
      // next month
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await deployer.ERC20Token.approve(Proxy.address, fourToken);
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(threePointEightToken);
    });

    it('New features in version 2', async () => {
      const { deployer, Proxy, users, Administrator1, Administrator2, ERC20Token } = await setup();
      await Administrator1.Proxy.setERC20(ERC20Token.address);
      await Administrator1.Proxy.setSpender(deployer.address);
      const User = users[8];
      const nonce = 0;
      const OnehundredToken = ethers.utils.parseEther('100');
      const NinetyFiveToken = ethers.utils.parseEther('95');
      const FiveToken = ethers.utils.parseEther('5');
      const NinetyPointFiveToken = ethers.utils.parseEther('9.5');

      await deployer.ERC20Token.approve(Proxy.address, OnehundredToken);

      // Injection income and pool
      expect((await Proxy.injectionIncomeAndPool(User.address, OnehundredToken)).toString()).to.be.eq(`${FiveToken.toString()},${NinetyFiveToken.toString()}`);

      // Inject release reward
      const InjectReleaseRewardHash = await Proxy.injectReleaseRewardHash(User.address, OnehundredToken, nonce);
      const InjectReleaseRewardHashToBytes = web3.utils.hexToBytes(InjectReleaseRewardHash);
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(InjectReleaseRewardHashToBytes));
      const sendHash = web3.utils.hexToBytes(await User.Proxy.HashToSign(InjectReleaseRewardHash));
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(Administrator1.Proxy.injectReleaseReward(User.address, OnehundredToken, nonce))
        .to.emit(Proxy, 'InjectReleaseReward')
        .withArgs(User.address, OnehundredToken)
        .to.emit(Proxy, 'WithdrawReleasedReward')
        .withArgs(User.address, FiveToken);

      // Personal first inject time and pool
      expect((await Proxy.releaseRewardInfo(User.address))[1]).to.be.eq(NinetyFiveToken);

      // Modify network block timestamp, a month later
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]); // The next block will take effect.
      await deployer.ERC20Token.approve(Proxy.address, OnehundredToken);
      expect(await User.Proxy.checkReleased(User.address)).to.be.eq(NinetyPointFiveToken);

      // Admin operation withdraw released reward
      await expect(Administrator1.Proxy.withdrawReleasedRewardTo(User.address))
        .to.emit(Proxy, 'WithdrawReleasedReward')
        .withArgs(User.address, NinetyPointFiveToken);

      // Future release data
      expect((await User.Proxy.futureReleaseData(User.address)).length).to.be.eq(100);
    });
  });
});
