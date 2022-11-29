import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {TestMultipleSigERC20} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('TestMultipleSigERC20');
  const {user1, user2, user3, user4, user5} = await getNamedAccounts();
  const contracts = {
    TestMultipleSigERC20: <TestMultipleSigERC20>await ethers.getContract('TestMultipleSigERC20'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    user1: await setupUser(user1, contracts), //4
    user2: await setupUser(user2, contracts), //5
    user3: await setupUser(user3, contracts), //6
    user4: await setupUser(user4, contracts), //7
    user5: await setupUser(user5, contracts), //8
    TotalMint: '1000000',
  };
});

describe('TestMultipleSigERC20 Token', () => {
  describe('Ownable check', () => {
    it('owners check', async () => {
      const {TestMultipleSigERC20, user1, user2, user3, user4, user5} = await setup();
      const owners = await TestMultipleSigERC20.owners();
      expect(owners[1]).to.be.eq(user1.address);
      expect(owners[2]).to.be.eq(user2.address);
      expect(owners[3]).to.be.eq(user3.address);
      expect(owners[4]).to.be.eq(user4.address);
      expect(owners[5]).to.be.eq(user5.address);
    });
    it('transferOwnership check', async () => {
      const {users, TestMultipleSigERC20, user1} = await setup();
      await expect(user1.TestMultipleSigERC20.transferOwnership(users[0].address))
        .to.emit(TestMultipleSigERC20, 'OwnershipTransferred')
        .withArgs(user1.address, users[0].address);
      const owners = await TestMultipleSigERC20.owners();

      expect(user1.TestMultipleSigERC20.transferOwnership(users[0].address)).to.be.revertedWith(
        'SafeOwnable: caller is not the owner1'
      );
      expect(owners[1]).to.be.eq(users[0].address);
    });
  });

  describe('multiple signature check', () => {
    it('mint check', async () => {
      const {users, TestMultipleSigERC20, user1, user2} = await setup();
      const nonce = await TestMultipleSigERC20.nonce();
      const to = users[0].address;
      const amount = 100;
      const mintHash = await TestMultipleSigERC20.getMintHash(to, amount, nonce);
      const sig2 = await user2.TestMultipleSigERC20.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(user1.TestMultipleSigERC20.mint(to, amount, [web3.utils.hexToBytes(sig2)]))
        .to.emit(TestMultipleSigERC20, 'Transfer')
        .withArgs(ethers.constants.AddressZero, to, amount);
      expect(await TestMultipleSigERC20.balanceOf(to)).to.be.eq(amount);
      expect(await TestMultipleSigERC20.nonce()).to.be.eq(nonce.add(1));

      //try to use singature again
      await expect(user1.TestMultipleSigERC20.mint(to, amount, [web3.utils.hexToBytes(sig2)])).to.be.revertedWith(
        'SafeOwnable: signer is not owner'
      );
    });

    it('mint2 check', async () => {
      const {users, TestMultipleSigERC20, user1, user2} = await setup();
      const nonce = await TestMultipleSigERC20.nonce();
      const to = users[0].address;
      const amount = 100;
      const mintHash = web3.utils.hexToBytes(await TestMultipleSigERC20.getMintHash(to, amount, nonce));
      const mintHashToSign = ethers.utils.hashMessage(mintHash);
      const sig2 = await user2.TestMultipleSigERC20.signer.signMessage(mintHash);
      await expect(user1.TestMultipleSigERC20.AddOpHashToPending(mintHashToSign, [sig2]))
        .to.emit(TestMultipleSigERC20, 'OperationAdded')
        .withArgs(mintHashToSign);
      expect(await TestMultipleSigERC20.nonce()).to.be.eq(nonce.add(1));

      await expect(user1.TestMultipleSigERC20.mint2(to, amount))
        .to.emit(TestMultipleSigERC20, 'Transfer')
        .withArgs(ethers.constants.AddressZero, to, amount);
      expect(await TestMultipleSigERC20.balanceOf(to)).to.be.eq(amount);

      //try to excute mint2 again
      await expect(user1.TestMultipleSigERC20.mint2(to, amount)).to.be.revertedWith(
        'SafeOwnable: operation not in pending'
      );
    });

    it('check insufficient signatures', async () => {
      const {users, TestMultipleSigERC20, user1} = await setup();
      const nonce = await TestMultipleSigERC20.nonce();
      const to = users[0].address;
      const amount = 100;
      const mintHash = await TestMultipleSigERC20.getMintHash(to, amount, nonce);
      const sig1 = await user1.TestMultipleSigERC20.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(user1.TestMultipleSigERC20.mint(to, amount, [web3.utils.hexToBytes(sig1)])).to.be.revertedWith(
        'SafeOwnable: no enough confirms'
      );
      expect(await TestMultipleSigERC20.balanceOf(to)).to.be.eq(0);
    });

    it('check strange signatures', async () => {
      const {users, TestMultipleSigERC20, user1} = await setup();

      const nonce = await TestMultipleSigERC20.nonce();
      const to = users[0].address;
      const amount = 200;
      const mintHash = await TestMultipleSigERC20.getMintHash(to, amount, nonce);
      const sig1 = await user1.TestMultipleSigERC20.signer.signMessage(web3.utils.hexToBytes(mintHash));
      const sig2 = await users[0].TestMultipleSigERC20.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(
        user1.TestMultipleSigERC20.mint(to, amount, [web3.utils.hexToBytes(sig1), web3.utils.hexToBytes(sig2)])
      ).to.be.revertedWith('SafeOwnable: signer is not owner');
      expect(await TestMultipleSigERC20.balanceOf(to)).to.be.eq(0);
    });
  });
});
