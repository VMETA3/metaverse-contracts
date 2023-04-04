import {expect} from '../chai-setup';
import {ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {TestERC20, VM3NFTV1} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const OnehundredToken = ethers.BigNumber.from('100000000000000000000');
const TenToken = OnehundredToken.div(10);

const setup = deployments.createFixture(async () => {
  await deployments.fixture('VM3NFTV1');
  await deployments.fixture('TestERC20');
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();

  const NFT = await ethers.getContractFactory('VM3NFTV1');

  const Costs = TenToken; // Costs
  const Name = 'VMeta3 NFT';
  const Symbol = 'VM3NFT';
  const signRequired = 2;
  const TokenURI =
    '{"name":"NFT 7","description":"this is the 7th NFT!","price":"0.09","image":"https://gateway.pinata.cloud/ipfs/QmNzNDMzrVduVrQAvJrp8GwdifEKiQmY1gSfPbq12C8Mhy"}';
  const owners = [Administrator1, Administrator2];

  const VM3NFTProxy = await upgrades.deployProxy(NFT, [Name, Symbol, owners, signRequired]);
  await VM3NFTProxy.deployed();

  const contracts = {
    ERC20Token: <TestERC20>await ethers.getContract('TestERC20'),
    NFT: <VM3NFTV1>await ethers.getContract('VM3NFTV1'),
    Proxy: <VM3NFTV1>VM3NFTProxy,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
    deployer: await setupUser(deployer, contracts),
    Name: Name,
    Symbol: Symbol,
    TokenURI: TokenURI,
    Costs: Costs,
    OnehundredToken: OnehundredToken,
    TenToken: TenToken,
  };
});

describe('VM3NFT Token', () => {
  describe('proxy information', async () => {
    it('The logical contract data is empty', async () => {
      const {NFT} = await setup();
      expect(await NFT.name()).to.be.eq('');
      expect(await NFT.symbol()).to.be.eq('');
      expect(await NFT.symbol()).to.be.eq('');
    });
    it('The agent contract has the correct information', async () => {
      const {Proxy, ERC20Token, Name, Symbol, Costs, Administrator1, Administrator2} = await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
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
    it('Deposit to sNFT and build NFT', async () => {
      const {ERC20Token, Proxy, OnehundredToken, TenToken, TokenURI, users, deployer, Administrator1, Administrator2} =
        await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
      const User = users[7];
      const Nonce1 = 0;
      const BuildHash = web3.utils.hexToBytes(await Proxy.getBuildHash(User.address, TokenURI, Nonce1));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash));
      const Sign = [Sig1, Sig2];

      // Step 1: Deposit ERC20Token
      await expect(deployer.ERC20Token.transfer(User.address, OnehundredToken))
        .to.emit(ERC20Token, 'Transfer')
        .withArgs(deployer.address, User.address, OnehundredToken);

      await expect(User.ERC20Token.approve(Proxy.address, OnehundredToken))
        .to.emit(ERC20Token, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredToken);

      await expect(User.Proxy.deposit(TenToken.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(User.address, TenToken.mul(2));

      // Step 2: Verify unauthorized transactions
      await expect(User.Proxy.build(TokenURI, Nonce1)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );

      // Step 3: Buiuld NFT
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

    it('Deposit to someone and build NFT', async () => {
      const {ERC20Token, Proxy, OnehundredToken, TenToken, TokenURI, users, deployer, Administrator1, Administrator2} =
        await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
      const User = users[7];
      const Someone = users[9];
      const Nonce = 0;
      const BuildHash = web3.utils.hexToBytes(await Proxy.getBuildHash(Someone.address, TokenURI, Nonce));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(BuildHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(BuildHash));
      const Sign = [Sig1, Sig2];

      // Step 1: Deposit ERC20Token
      await expect(deployer.ERC20Token.transfer(User.address, OnehundredToken))
        .to.emit(ERC20Token, 'Transfer')
        .withArgs(deployer.address, User.address, OnehundredToken);

      await expect(User.ERC20Token.approve(Proxy.address, OnehundredToken))
        .to.emit(ERC20Token, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredToken);

      await expect(User.Proxy.depositTo(Someone.address, TenToken.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(Someone.address, TenToken.mul(2));

      // Step 2: Verify unauthorized transactions
      await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce)).to.revertedWith('NFT: Insufficient deposits');

      // // Step 3: Buiuld NFT But the minter needs to own ERC20Token
      // await expect(User.Proxy.buildTo(Someone.address, TokenURI, Nonce)).to.revertedWith('NFT: Insufficient deposits');

      // Step 4: Deposit ERC20Token to sNFT
      await expect(User.Proxy.deposit(TenToken.mul(2)))
        .to.emit(Proxy, 'Deposit')
        .withArgs(User.address, TenToken.mul(2));

      // // Step 5: Buiuld NFT
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

      // Step 9: Verify refundAtDisposal for totalERC20Token
      // Step 9-1: Withdraw more than the amount at your disposal
      const Nonce3 = 3;
      // const refundAtDisposalHash = web3.utils.hexToBytes(
      //   await Proxy.getrefundAtDisposalHash(Administrator1.address, TenToken.mul(5), Nonce3)
      // );
      // const Sig1_3 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundAtDisposalHash));
      // const Sig2_3 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundAtDisposalHash));
      // const Sign3 = [Sig1_3, Sig2_3];
      await expect(User.Proxy.refundAtDisposal(Someone.address, TenToken.mul(5), Nonce3)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );
      // await expect(User.Proxy.refundAtDisposal(Administrator1.address, TenToken.mul(5), Nonce3)).to.revertedWith(
      //   'NFT: Insufficient atDisposal'
      // );

      // Step 9-2: Normal extraction
      const Disposal = TenToken.mul(2);
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
      const {ERC20Token, Proxy, OnehundredToken, TenToken, users, deployer, Administrator1} = await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
      const User = users[8];
      const Someone = users[9];
      await expect(deployer.ERC20Token.transfer(User.address, OnehundredToken.mul(10)))
        .to.emit(ERC20Token, 'Transfer')
        .withArgs(deployer.address, User.address, OnehundredToken.mul(10));

      await expect(User.ERC20Token.approve(Proxy.address, OnehundredToken))
        .to.emit(ERC20Token, 'Approval')
        .withArgs(User.address, Proxy.address, OnehundredToken);

      await expect(User.Proxy.depositTo(Someone.address, TenToken))
        .to.emit(Proxy, 'Deposit')
        .withArgs(Someone.address, TenToken);

      await expect(User.Proxy.deposit(TenToken)).to.emit(Proxy, 'Deposit').withArgs(User.address, TenToken);

      expect(await ERC20Token.balanceOf(User.address)).to.be.eq(OnehundredToken.mul(10).sub(TenToken.mul(2)));
      expect(await Proxy.balanceOfERC20(User.address)).to.be.eq(TenToken);
      expect(await Proxy.balanceOfERC20(Someone.address)).to.be.eq(TenToken);
    });
    it('Verify users withdraw balance', async () => {
      const {ERC20Token, Proxy, OnehundredToken, TenToken, users, deployer, Administrator1} = await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
      const User = users[7];
      const U1 = users[9];
      const U2 = users[8];
      await deployer.ERC20Token.transfer(User.address, OnehundredToken.mul(10));
      await User.ERC20Token.approve(Proxy.address, OnehundredToken.mul(10));
      await User.Proxy.depositTo(U1.address, OnehundredToken);
      await User.Proxy.depositTo(U2.address, OnehundredToken);

      await expect(U1.Proxy.withdraw(TenToken)).to.emit(Proxy, 'Withdraw').withArgs(U1.address, TenToken);
      expect(await ERC20Token.balanceOf(U1.address)).to.be.eq(TenToken);
      expect(await Proxy.balanceOfERC20(U1.address)).to.be.eq(TenToken.mul(9));

      await expect(U2.Proxy.withdraw(TenToken.mul(2)))
        .to.emit(Proxy, 'Withdraw')
        .withArgs(U2.address, TenToken.mul(2));
      expect(await ERC20Token.balanceOf(U2.address)).to.be.eq(TenToken.mul(2));
      expect(await Proxy.balanceOfERC20(U2.address)).to.be.eq(TenToken.mul(8));

      await expect(U1.Proxy.withdrawTo(U2.address, TenToken)).to.emit(Proxy, 'Withdraw').withArgs(U2.address, TenToken);
      expect(await ERC20Token.balanceOf(U1.address)).to.be.eq(TenToken);
      expect(await Proxy.balanceOfERC20(U1.address)).to.be.eq(TenToken.mul(8));
      expect(await ERC20Token.balanceOf(U2.address)).to.be.eq(TenToken.mul(3));
      expect(await Proxy.balanceOfERC20(U2.address)).to.be.eq(TenToken.mul(8));
    });

    it('Verify admin refund balance', async () => {
      const {ERC20Token, Proxy, OnehundredToken, TenToken, Administrator1, Administrator2, users, deployer} =
        await setup();
      Administrator1.Proxy.setERC20(ERC20Token.address);
      Administrator1.Proxy.setCosts(TenToken);
      const User = users[7];
      const U1 = users[9];
      const U2 = users[8];
      await deployer.ERC20Token.transfer(User.address, OnehundredToken.mul(10));
      await User.ERC20Token.approve(Proxy.address, OnehundredToken.mul(10));
      await User.Proxy.depositTo(U1.address, OnehundredToken);
      await User.Proxy.depositTo(U2.address, OnehundredToken);

      const Nonce = 0;
      const refundHash = web3.utils.hexToBytes(await Proxy.getRefundHash(U1.address, TenToken, Nonce));
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundHash));
      const Sign = [Sig1, Sig2];
      await Administrator1.Proxy.AddOpHashToPending(
        web3.utils.hexToBytes(await Proxy.HashToSign(await Proxy.getRefundHash(U1.address, TenToken, Nonce))),
        Sign
      );

      await expect(Administrator1.Proxy.refund(U1.address, TenToken, Nonce))
        .to.emit(Proxy, 'Refund')
        .withArgs(U1.address, TenToken, false);
      expect(await ERC20Token.balanceOf(U1.address)).to.be.eq(TenToken);
      expect(await Proxy.balanceOfERC20(U1.address)).to.be.eq(TenToken.mul(9));
    });
  });
});
