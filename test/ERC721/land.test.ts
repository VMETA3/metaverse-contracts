import { expect } from '../chai-setup';
import { ethers, upgrades, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { Land, VM3 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';

const Name = 'VMeta3 Land';
const Symbol = 'VM3Land';
const TokenURI =
  '{"name":"elf 7","description":"this is the 7th elf!","price":"0.09","image":"https://gateway.pinata.cloud/ipfs/QmNzNDMzrVduVrQAvJrp8GwdifEKiQmY1gSfPbq12C8Mhy"}';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Land');

  const { possessor, deployer, owner, Administrator1, Administrator2 } = await getNamedAccounts();

  const contracts = {
    Land: <Land>await ethers.getContract('Land'),
    TestVOV: <VM3>await ethers.getContract('VM3'),
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
      const { Land } = await setup();
      expect(await Land.name()).to.be.eq(Name);
      expect(await Land.symbol()).to.be.eq(Symbol);
    });
  });

  describe('mint land', async () => {
    it('Should success minter mint nft', async () => {
      const { users, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;

      const TokenId = await User.Land._tokenIdCounter();
      await Minter.Land.awardItem(User.address, TokenURI);
      expect(await User.Land.ownerOf(TokenId)).to.eq(User.address);
    });

    it('Should fail non-minter mint nft', async () => {
      const { users } = await setup();
      const NonMinter = users[7];

      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
      await expect(NonMinter.Land.awardItem(NonMinter.address, TokenURI)).to.revertedWith(
        `AccessControl: account ${NonMinter.address.toLowerCase()} is missing role ${hash}`
      );
    });
  });

  describe('inject active', async () => {
    it('Should success user inject active', async () => {
      const { users, possessor, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;
      const TokenId = await User.Land._tokenIdCounter();

      // Mint NFT
      await Minter.Land.awardItem(User.address, TokenURI);

      // Send VOV to user, and approve Land to spend VOV
      const OneHundred = ethers.utils.parseEther('100');
      await possessor.TestVOV.transfer(User.address, OneHundred);
      await User.TestVOV.approve(User.Land.address, OneHundred);

      // Inject
      expect(await User.Land.getLandStatus(TokenId)).to.eq(false);
      await User.Land.injectActive(TokenId, OneHundred);
      expect(await User.Land.getLandStatus(TokenId)).to.eq(true);
    });

    it('Should fail various non compliant conditions', async () => {
      const { users, possessor, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;
      const TokenId = await User.Land._tokenIdCounter();

      // Mint NFT
      await Minter.Land.awardItem(User.address, TokenURI);

      // Send VOV to users, and approve Land to spend VOV
      const OneHundred = ethers.utils.parseEther('100');
      await possessor.TestVOV.transfer(User.address, OneHundred);
      await User.TestVOV.approve(User.Land.address, OneHundred);

      // Injection active is too small
      const TooSmall = ethers.utils.parseEther('0.99');
      await expect(User.Land.injectActive(TokenId, TooSmall)).to.revertedWith(
        'Land: active value must be greater than minimum injection quantity'
      );

      // Injection active is too large
      const TooLarge = ethers.utils.parseEther('100.1');
      await expect(User.Land.injectActive(TokenId, TooLarge)).to.revertedWith(
        'Land: too many active values'
      );
    });
  });

  describe('Minting control', async () => {
    it('Should success admin role call disableMint', async () => {
      const { users, Administrator1 } = await setup();
      const User = users[7];

      expect(await User.Land.getEnableMintStatus()).to.eq(true);
      await Administrator1.Land.disableMint();
      expect(await User.Land.getEnableMintStatus()).to.eq(false);
    });

    it('Should fail non-admin role call disableMint or enableMint', async () => {
      const { users } = await setup();
      const User = users[7];

      await expect(User.Land.disableMint()).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
      await expect(User.Land.enableMint()).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
    });

    it('Should success effective enable status after 2 days', async () => {
      const { users, Administrator1, Administrator2 } = await setup();
      const User = users[7];
      const Minter = Administrator2;

      await Administrator1.Land.disableMint();
      await Administrator1.Land.enableMint();

      // Enable status not effective, Expect minting failure
      await expect(Minter.Land.awardItem(User.address, TokenURI)).to.revertedWith(
        'Land: Minting is disabled'
      );

      // After 2 days, enable status effective, Expect minting success
      expect(await User.Land.getEnableMintStatus()).to.eq(false);

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 2 + 1]);
      await Minter.Land.awardItem(User.address, TokenURI);

      expect(await User.Land.getEnableMintStatus()).to.eq(true);
    });
  });

  describe('Active condition control', async () => {
    it('Should success admin role call setActiveCondition', async () => {
      const { Administrator1 } = await setup();
      const NewActiveCondition = ethers.utils.parseEther('1000');

      // Expect successful request for new active condition
      expect(await Administrator1.Land.activeConditionRequestTime()).to.eq(0);
      await Administrator1.Land.setActiveCondition(NewActiveCondition);
      expect(await Administrator1.Land.activeConditionRequestTime()).to.not.eq(0);
    });

    it('Should fail non-admin role call setActiveCondition', async () => {
      const { users } = await setup();
      const User = users[7];
      const NewActiveCondition = ethers.utils.parseEther('1000');

      await expect(User.Land.setActiveCondition(NewActiveCondition)).to.revertedWith(
        `AccessControl: account ${User.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
    });

    it('Should success effective active condition after 2 days', async () => {
      const { users, Administrator1, Administrator2 } = await setup();
      const User = users[7];
      const Admin = Administrator1;
      const Minter = Administrator2;
      const OldActiveCondition = ethers.utils.parseEther('100');
      const NewActiveCondition = ethers.utils.parseEther('1000');

      // Send request for new active condition
      await Admin.Land.setActiveCondition(NewActiveCondition);

      // Set active condition not effective
      expect(await User.Land.getActiveCondition()).to.eq(OldActiveCondition);

      // After 2 days, status effective
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 2 + 1]);
      const TokenId = await User.Land._tokenIdCounter();
      await Minter.Land.awardItem(User.address, TokenURI);

      expect(await User.Land.getLandConditions(TokenId)).to.eq(NewActiveCondition.toString());
      expect(await User.Land.getActiveCondition()).to.eq(NewActiveCondition);
    });

    it('Before the last setting takes effect, setting it again will replace the last record', async () => {
      const { users, Administrator1, Administrator2 } = await setup();
      const User = users[7];
      const Admin = Administrator1;
      const Minter = Administrator2;
      const FirstNewActiveCondition = ethers.utils.parseEther('1000');
      const SecondNewActiveCondition = ethers.utils.parseEther('2000');

      // Send request for new active condition
      await Admin.Land.setActiveCondition(FirstNewActiveCondition);

      // Setting again
      await Admin.Land.setActiveCondition(SecondNewActiveCondition);

      // After 2 days, status effective
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 2 + 1]);
      await Minter.Land.awardItem(User.address, TokenURI); // Send transaction to trigger the update of the block timestamp
      expect(await User.Land.getActiveCondition()).to.eq(SecondNewActiveCondition);
    });
  });
});
