import {expect} from '../chai-setup';
import {ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts, network} from 'hardhat';
import {VM3, VM3Elf} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('VM3Elf');
  await deployments.fixture('VM3');
  const {deployer, possessor, Administrator1, Administrator2} = await getNamedAccounts();
  const OnehundredVM3 = ethers.BigNumber.from('100000000000000000000');
  const TenVM3 = OnehundredVM3.div(10);

  const Elf = await ethers.getContractFactory('VM3Elf');
  const VM3 = await deployments.get('VM3'); // VMeta3 Token

  const chainId = network.config.chainId; // chain id
  const Costs = TenVM3; // Costs
  const Name = 'VMeta3 Elf';
  const Symbol = 'VM3Elf';
  const signRequired = 2;
  const TokenURI =
    '{"name":"elf 7","description":"this is the 7th elf!","price":"0.09","image":"https://gateway.pinata.cloud/ipfs/QmNzNDMzrVduVrQAvJrp8GwdifEKiQmY1gSfPbq12C8Mhy"}';
  const owners = [Administrator1, Administrator2];

  const VM3ElfProxy = await upgrades.deployProxy(Elf, [
    chainId,
    VM3.address,
    Costs,
    Name,
    Symbol,
    owners,
    signRequired,
  ]);
  await VM3ElfProxy.deployed();

  const contracts = {
    VM3: <VM3>await ethers.getContract('VM3'),
    Elf: <VM3Elf>await ethers.getContract('VM3Elf'),
    Proxy: <VM3Elf>VM3ElfProxy,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
    possessor: await setupUser(possessor, contracts),
    deployer: await setupUser(deployer, contracts),
    Name: Name,
    Symbol: Symbol,
    TokenURI: TokenURI,
    Costs: Costs,
    OnehundredVM3: OnehundredVM3,
    TenVM3: TenVM3,
  };
});

describe('VM3Elf Token', () => {
  describe('proxy information', async () => {
    it('The logical contract data is empty', async () => {
      const {Elf} = await setup();
      expect(await Elf.name()).to.be.eq('');
      expect(await Elf.symbol()).to.be.eq('');
      expect(await Elf.symbol()).to.be.eq('');
    });
    it('The agent contract has the correct information', async () => {
      const {Proxy, Name, Symbol, Costs, Administrator1, Administrator2} = await setup();
      expect(await Proxy.name()).to.be.eq(Name);
      expect(await Proxy.symbol()).to.be.eq(Symbol);
      expect(await Proxy.costs()).to.be.eq(Costs);
      const Owners = await Proxy.owners();
      expect(Owners.length).to.be.eq(6);
      expect(Owners[1]).to.be.eq(Administrator1.address);
      expect(Owners[2]).to.be.eq(Administrator2.address);
    });
  });

  describe('complete casting process', async () => {
    it('Deposit to self and build Elf', async () => {
      const {VM3, Proxy, OnehundredVM3, TenVM3, TokenURI, users, possessor, Administrator1, Administrator2} =
        await setup();
      const User = users[10];
      const Nonce1 = 0;
      const BuildHash = web3.utils.hexToBytes(await Proxy.getBuildHash(User.address, TokenURI, Nonce1));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash));
      const Sign = [Sig1, Sig2];

      // Step 1: Deposit VM3
      await expect(possessor.VM3.transfer(User.address, OnehundredVM3))
        .to.emit(VM3, 'Transfer')
        .withArgs(possessor.address, User.address, OnehundredVM3);

      await expect(User.VM3.approve(Proxy.address, OnehundredVM3))
        .to.emit(VM3, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredVM3);

      await expect(User.Proxy.deposit(TenVM3.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(User.address, TenVM3.mul(2));

      // Step 2: Verify unauthorized transactions
      await expect(User.Proxy.build(TokenURI, Nonce1)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      // Step 3: Buiuld ELF
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getBuildHash(User.address, TokenURI, Nonce1))),
        Sign
      );
      await expect(User.Proxy.build(TokenURI, Nonce1)).to.emit(Proxy, 'Build').withArgs(User.address, 0);

      // Step 4: Try to use the last signature and get an error
      await expect(User.Proxy.build(TokenURI, Nonce1)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      // Step 5: Buiuld again
      const Nonce2 = 1;
      const BuildHash2 = web3.utils.hexToBytes(await Proxy.getBuildHash(User.address, TokenURI, Nonce2));
      const Sig1_2 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash2));
      const Sig2_2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash2));
      const Sign2 = [Sig1_2, Sig2_2];
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getBuildHash(User.address, TokenURI, Nonce2))),
        Sign2
      );
      await expect(User.Proxy.build(TokenURI, Nonce2)).to.emit(Proxy, 'Build').withArgs(User.address, 1);

      // Step 6: Verify the ELS data
      expect(await Proxy.balanceOf(User.address)).to.be.eq(2);
      expect(await Proxy.tokenURI(0)).to.be.eq(TokenURI);
      expect(await Proxy.tokenURI(1)).to.be.eq(TokenURI);
      expect(await Proxy.ownerOf(0)).to.be.eq(User.address);
      expect(await Proxy.ownerOf(1)).to.be.eq(User.address);
    });

    it('Deposit to someone and build Elf', async () => {
      const {VM3, Proxy, OnehundredVM3, TenVM3, TokenURI, users, possessor, Administrator1, Administrator2} =
        await setup();
      const User = users[10];
      const Someone = users[9];
      const Nonce = 0;
      const BuildHash = web3.utils.hexToBytes(await Proxy.getBuildHash(Someone.address, TokenURI, Nonce));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash));
      const Sign = [Sig1, Sig2];

      // Step 1: Deposit VM3
      await expect(possessor.VM3.transfer(User.address, OnehundredVM3))
        .to.emit(VM3, 'Transfer')
        .withArgs(possessor.address, User.address, OnehundredVM3);

      await expect(User.VM3.approve(Proxy.address, OnehundredVM3))
        .to.emit(VM3, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredVM3);

      await expect(User.Proxy.depositTo(Someone.address, TenVM3.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(Someone.address, TenVM3.mul(2));

      // Step 2: Verify unauthorized transactions
      await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce)).to.revertedWith('Elf: Insufficient deposits');

      // // Step 3: Buiuld ELF But the minter needs to own vm3
      // await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce)).to.revertedWith('Elf: Insufficient deposits');

      // Step 4: Deposit VM3 to self
      await expect(User.Proxy.deposit(TenVM3.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(User.address, TenVM3.mul(2));

      // // Step 5: Buiuld ELF
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getBuildHash(Someone.address, TokenURI, Nonce))),
        Sign
      );
      await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce))
        .to.emit(Proxy, 'Build')
        .withArgs(Someone.address, 0);

      // // Step 6: Try to use the last signature and get an error
      await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      // Step 7: Buiuld again
      const Nonce2 = 1;
      const BuildHash2 = web3.utils.hexToBytes(await Proxy.getBuildHash(Someone.address, TokenURI, Nonce2));
      const Sig1_2 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash2));
      const Sig2_2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash2));
      const Sign2 = [Sig1_2, Sig2_2];
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getBuildHash(Someone.address, TokenURI, Nonce2))),
        Sign2
      );
      await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce2))
        .to.emit(Proxy, 'Build')
        .withArgs(Someone.address, 1);

      // // Step 8: Verify the ELS data
      expect(await Proxy.balanceOf(Someone.address)).to.be.eq(2);
      expect(await Proxy.tokenURI(0)).to.be.eq(TokenURI);
      expect(await Proxy.tokenURI(1)).to.be.eq(TokenURI);
      expect(await Proxy.ownerOf(0)).to.be.eq(Someone.address);
      expect(await Proxy.ownerOf(1)).to.be.eq(Someone.address);

      // Step 9: Verify refundAtDisposal for totalVM3
      // Step 9-1: Withdraw more than the amount at your disposal
      const Nonce3 = 3;
      // const refundAtDisposalHash = web3.utils.hexToBytes(
      //   await Proxy.getrefundAtDisposalHash(Administrator1.address, TenVM3.mul(5), Nonce3)
      // );
      // const Sig1_3 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundAtDisposalHash));
      // const Sig2_3 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundAtDisposalHash));
      // const Sign3 = [Sig1_3, Sig2_3];
      await expect(User.Proxy.refundAtDisposal(Someone.address, TenVM3.mul(5), Nonce3)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );
      // await expect(User.Proxy.refundAtDisposal(Administrator1.address, TenVM3.mul(5), Nonce3)).to.revertedWith(
      //   'Elf: Insufficient atDisposal'
      // );

      // Step 9-2: Normal extraction
      const Disposal = TenVM3.mul(2);
      const Nonce4 = 4;
      const refundAtDisposalHash2 = web3.utils.hexToBytes(
        await Proxy.getrefundAtDisposalHash(Administrator1.address, Disposal, Nonce4)
      );
      const Sig1_4 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundAtDisposalHash2));
      const Sig2_4 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundAtDisposalHash2));
      const Sign4 = [Sig1_4, Sig2_4];
      await expect(User.Proxy.refundAtDisposal(Administrator1.address, Disposal, Nonce4)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(
          await Proxy.HashToSign(await Proxy.getrefundAtDisposalHash(Administrator1.address, Disposal, Nonce4))
        ),
        Sign4
      );
      await expect(Administrator1.Proxy.refundAtDisposal(Administrator1.address, Disposal, Nonce4))
        .to.emit(Proxy, 'Refund')
        .withArgs(Administrator1.address, Disposal, true);
    });
  });

  describe('deposit and withdraw', async () => {
    it('Verify users deposit balance', async () => {
      const {VM3, Proxy, OnehundredVM3, TenVM3, users, possessor} = await setup();
      const User = users[10];
      const Someone = users[9];
      await expect(possessor.VM3.transfer(User.address, OnehundredVM3.mul(10)))
        .to.emit(VM3, 'Transfer')
        .withArgs(possessor.address, User.address, OnehundredVM3.mul(10));

      await expect(User.VM3.approve(Proxy.address, OnehundredVM3))
        .to.emit(VM3, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredVM3);

      await expect(User.Proxy.depositTo(Someone.address, TenVM3))
        .to.emit(Proxy, 'Deposit')
        .withArgs(Someone.address, TenVM3);

      await expect(User.Proxy.deposit(TenVM3)).to.emit(Proxy, 'Deposit').withArgs(User.address, TenVM3);

      expect(await VM3.balanceOf(User.address)).to.be.eq(OnehundredVM3.mul(10).sub(TenVM3.mul(2)));
      expect(await Proxy.balanceOfVM3(User.address)).to.be.eq(TenVM3);
      expect(await Proxy.balanceOfVM3(Someone.address)).to.be.eq(TenVM3);
    });
    it('Verify users withdraw balance', async () => {
      const {VM3, Proxy, OnehundredVM3, TenVM3, users, possessor} = await setup();
      const User = users[10];
      const U1 = users[9];
      const U2 = users[8];
      await possessor.VM3.transfer(User.address, OnehundredVM3.mul(10));
      await User.VM3.approve(Proxy.address, OnehundredVM3.mul(10));
      await User.Proxy.depositTo(U1.address, OnehundredVM3);
      await User.Proxy.depositTo(U2.address, OnehundredVM3);

      await expect(U1.Proxy.withdraw(TenVM3)).to.emit(Proxy, 'Withdraw').withArgs(U1.address, TenVM3);
      expect(await VM3.balanceOf(U1.address)).to.be.eq(TenVM3);
      expect(await Proxy.balanceOfVM3(U1.address)).to.be.eq(TenVM3.mul(9));

      await expect(U2.Proxy.withdraw(TenVM3.mul(2)))
        .to.emit(Proxy, 'Withdraw')
        .withArgs(U2.address, TenVM3.mul(2));
      expect(await VM3.balanceOf(U2.address)).to.be.eq(TenVM3.mul(2));
      expect(await Proxy.balanceOfVM3(U2.address)).to.be.eq(TenVM3.mul(8));

      await expect(U1.Proxy.withdrawTo(U2.address, TenVM3)).to.emit(Proxy, 'Withdraw').withArgs(U2.address, TenVM3);
      expect(await VM3.balanceOf(U1.address)).to.be.eq(TenVM3);
      expect(await Proxy.balanceOfVM3(U1.address)).to.be.eq(TenVM3.mul(8));
      expect(await VM3.balanceOf(U2.address)).to.be.eq(TenVM3.mul(3));
      expect(await Proxy.balanceOfVM3(U2.address)).to.be.eq(TenVM3.mul(8));
    });

    it('Verify admin refund balance', async () => {
      const {VM3, Proxy, OnehundredVM3, TenVM3, Administrator1, Administrator2, users, possessor} = await setup();
      const User = users[10];
      const U1 = users[9];
      const U2 = users[8];
      await possessor.VM3.transfer(User.address, OnehundredVM3.mul(10));
      await User.VM3.approve(Proxy.address, OnehundredVM3.mul(10));
      await User.Proxy.depositTo(U1.address, OnehundredVM3);
      await User.Proxy.depositTo(U2.address, OnehundredVM3);

      const Nonce = 0;
      const refundHash = web3.utils.hexToBytes(await Proxy.getRefundHash(U1.address, TenVM3, Nonce));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundHash));
      const Sign = [Sig1, Sig2];
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getRefundHash(U1.address, TenVM3, Nonce))),
        Sign
      );

      await expect(Administrator1.Proxy.refund(U1.address, TenVM3, Nonce))
        .to.emit(Proxy, 'Refund')
        .withArgs(U1.address, TenVM3, false);
      expect(await VM3.balanceOf(U1.address)).to.be.eq(TenVM3);
      expect(await Proxy.balanceOfVM3(U1.address)).to.be.eq(TenVM3.mul(9));
    });
  });
});
