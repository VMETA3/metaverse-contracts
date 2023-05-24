import { expect } from '../chai-setup';
import { ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { Land, VM3 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';
import web3 from 'web3';

const Name = 'VMeta3 Land';
const Symbol = 'VM3LAND';
const TokenURI =
  '{"name":"elf 7","description":"this is the 7th elf!","price":"0.09","image":"https://gateway.pinata.cloud/ipfs/QmNzNDMzrVduVrQAvJrp8GwdifEKiQmY1gSfPbq12C8Mhy"}';
const ZeroAddr = '0x0000000000000000000000000000000000000000';
const TestConditions = '100000000000000000000000';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Land');
  const { possessor, deployer, owner, Administrator1, Administrator2 } = await getNamedAccounts();

  const Land = await ethers.getContractFactory('Land');
  const TestVOV = await ethers.getContract('VM3');
  const ActiveThreshold = ethers.utils.parseEther('100');
  const MinimumInjectionQuantity = ethers.utils.parseEther('1');

  const LandProxy = await upgrades.deployProxy(Land, [Name, Symbol, TestVOV.address, Administrator1, Administrator2, ActiveThreshold, MinimumInjectionQuantity]);
  await LandProxy.deployed();

  const contracts = {
    Land: <Land>await ethers.getContract('Land'),
    Proxy: <Land>LandProxy,
    TestVOV: <VM3>TestVOV,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    owner: await setupUser(owner, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
    possessor: await setupUser(possessor, contracts),
  };
});

describe('Land Token', () => {
  describe('proxy information', async () => {
    it('The agent contract has the correct information', async () => {
      const { Proxy } = await setup();
      expect(await Proxy.name()).to.be.eq(Name);
      expect(await Proxy.symbol()).to.be.eq(Symbol);
    });
  });

  describe('mint land', async () => {
    it('Should success minter mint nft', async () => {
      const { users, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;

      const TokenId = await User.Proxy._tokenIdCounter();
      await Minter.Proxy.awardItem(User.address, TokenURI);
      expect(await User.Proxy.ownerOf(TokenId)).to.eq(User.address);
    });

    it('Should fail non-minter mint nft', async () => {
      const { users } = await setup();
      const NonMinter = users[7];

      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
      await expect(NonMinter.Proxy.awardItem(NonMinter.address, TokenURI)).to.revertedWith(
        `AccessControl: account ${NonMinter.address.toLowerCase()} is missing role ${hash}`
      );
    });
  });

  describe('inject active', async () => {
    it('Should success user inject active', async () => {
      const { users, possessor, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;
      const TokenId = await User.Proxy._tokenIdCounter();

      // Mint NFT
      await Minter.Proxy.awardItem(User.address, TokenURI);

      // Send VOV to users, and approve Proxy to spend VOV
      const OneHundred = ethers.utils.parseEther('100');
      await possessor.TestVOV.transfer(User.address, OneHundred);
      await User.TestVOV.approve(User.Proxy.address, OneHundred);

      // Inject
      expect(await User.Proxy.getLandStatus(TokenId)).to.eq(false);
      await expect(User.Proxy.injectActive(TokenId, OneHundred));
      expect(await User.Proxy.getLandStatus(TokenId)).to.eq(true);
    });

    it('Should fail various non compliant conditions', async () => {
      const { users, possessor, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;
      const TokenId = await User.Proxy._tokenIdCounter();

      // Mint NFT
      await Minter.Proxy.awardItem(User.address, TokenURI);

      // Send VOV to users, and approve Proxy to spend VOV
      const OneHundred = ethers.utils.parseEther('100');
      await possessor.TestVOV.transfer(User.address, OneHundred);
      await User.TestVOV.approve(User.Proxy.address, OneHundred);

      // Injection active is too small
      const TooSmall = ethers.utils.parseEther('0.1');
      await expect(User.Proxy.injectActive(TokenId, TooSmall)).to.revertedWith(
        'Land: active value must be greater than minimum injection quantity'
      );

      // Injection active is too large
      const TooLarge = ethers.utils.parseEther('1000');
      await expect(User.Proxy.injectActive(TokenId, TooLarge)).to.revertedWith(
        'Land: too many active values'
      );
    });
  });

  describe('Minting control', async () => {
    it('Should success admin role call disableMint', async () => {
      const { users, Administrator1 } = await setup();
      const User = users[7];

      expect(await User.Proxy.enableMintStatus()).to.eq(true);
      await Administrator1.Proxy.disableMint();
      expect(await User.Proxy.enableMintStatus()).to.eq(false);
    });

    it('Should fail non-admin role call disableMint or enableMint', async () => {
      const { users } = await setup();
      const User = users[7];

      await expect(User.Proxy.disableMint()).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
      await expect(User.Proxy.enableMint()).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
    });

    it('Should success effective enable status after 2 days', async () => {
      const { users, Administrator1, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;

      await Administrator1.Proxy.disableMint();
      await Administrator1.Proxy.enableMint();

      // Enable status not effective, Expect minting failure
      await expect(Minter.Proxy.awardItem(User.address, TokenURI)).to.revertedWith(
        'Land: Minting is disabled'
      );

      // After 2 days, enable status effective, Expect minting success
      expect(await User.Proxy.enableMintStatus()).to.eq(false);

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 2 + 1]);
      const TokenId = await User.Proxy._tokenIdCounter();
      await Minter.Proxy.awardItem(User.address, TokenURI);

      expect(await User.Proxy.enableMintRequestTime()).to.eq(0);
      expect(await User.Proxy.enableMintStatus()).to.eq(true);
    });
  });

  describe('Minting control', async () => {
    it('Should success admin role call setActiveThreshold', async () => {
      const { Administrator1 } = await setup();
      const NewActiveThreshold = ethers.utils.parseEther('1000');

      // Expect successful request for new active threshold
      expect(await Administrator1.Proxy.activeThresholdRequestTime()).to.eq(0);
      await Administrator1.Proxy.setActiveThreshold(NewActiveThreshold);
      expect(await Administrator1.Proxy.activeThresholdRequestTime()).to.not.eq(0);
    });

    it('Should fail non-admin role call setActiveThreshold', async () => {
      const { users } = await setup();
      const User = users[7];
      const NewActiveThreshold = ethers.utils.parseEther('1000');

      await expect(User.Proxy.setActiveThreshold(NewActiveThreshold)).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
    });

    it('Should success effective active threshold after 2 days', async () => {
      const { users, Administrator1, Administrator2 } = await setup();
      const User = users[7];
      const Admin = Administrator1;
      const Minter = Administrator2;
      const OldActiveThreshold = ethers.utils.parseEther('100');
      const NewActiveThreshold = ethers.utils.parseEther('1000');

      // Send request for new active threshold
      await Admin.Proxy.setActiveThreshold(NewActiveThreshold);

      // Set active threshold not effective
      expect(await User.Proxy.activeThreshold()).to.eq(OldActiveThreshold);

      // After 2 days, status effective
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 2 + 1]);
      const TokenId = await User.Proxy._tokenIdCounter();
      await Minter.Proxy.awardItem(User.address, TokenURI);

      // expect(await User.Proxy.getLandConditions(TokenId)).to.eq(NewActiveThreshold.toString());
      expect(await User.Proxy.activeThresholdRequestTime()).to.eq(0);
      expect(await User.Proxy.activeThreshold()).to.eq(NewActiveThreshold);
    });
  });
});
