import {expect} from '../chai-setup';
import {ethers, network, upgrades, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {Land} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const Name = 'VMeta3 Land';
const Symbol = 'VMTLAND';
const signRequired = 2;
const TokenURI =
  '{"name":"elf 7","description":"this is the 7th elf!","price":"0.09","image":"https://gateway.pinata.cloud/ipfs/QmNzNDMzrVduVrQAvJrp8GwdifEKiQmY1gSfPbq12C8Mhy"}';
const ZeroAddr = '0x0000000000000000000000000000000000000000';
const TestConditions = '100000000000000000000000';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Land');
  const chainId = network.config.chainId; // chain id
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();
  const owners = [Administrator1, Administrator2];

  const Land = await ethers.getContractFactory('Land');
  const LandProxy = await upgrades.deployProxy(Land, [chainId, 'VMeta3 Land', 'VMTLAND', owners, signRequired]);
  await LandProxy.deployed();

  const contracts = {
    Land: <Land>await ethers.getContract('Land'),
    Proxy: <Land>LandProxy,
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

describe('Land Token', () => {
  describe('proxy information', async () => {
    it('The agent contract has the correct information', async () => {
      const {Proxy, Administrator1, Administrator2} = await setup();
      expect(await Proxy.name()).to.be.eq(Name);
      expect(await Proxy.symbol()).to.be.eq(Symbol);
      const Owners = await Proxy.owners();
      expect(Owners.length).to.be.eq(6);
      expect(Owners[1]).to.be.eq(Administrator1.address);
      expect(Owners[2]).to.be.eq(Administrator2.address);
    });
  });
  describe('mint land', async () => {
    it('Simulate a scenario that the user creates at will', async () => {
      const {users} = await setup();
      const User = users[10];
      await expect(User.Proxy.awardItem(User.address, TestConditions, TokenURI)).to.revertedWith(
        'SafeOwnableUpgradeable: caller is not the owner'
      );
    });
    it('Admin build land', async () => {
      const {users, Proxy, Administrator1} = await setup();
      const User = users[10];
      await expect(Administrator1.Proxy.awardItem(User.address, TestConditions, TokenURI))
        .to.emit(Proxy, 'Transfer')
        .withArgs(ZeroAddr, User.address, 0);
    });
  });

  describe('inject active', async () => {
    it('Called in an unauthorized state', async () => {
      const {users, Administrator1, Administrator2, Proxy} = await setup();
      const User = users[10];
      const active = 1000;
      const nonce = 0;
      await Administrator1.Proxy.awardItem(Administrator1.address, TestConditions, TokenURI);
      const TokenZreo = 0;
      expect(await Proxy.ownerOf(TokenZreo)).to.eq(Administrator1.address);

      // Regular injection of active values
      await expect(User.Proxy.injectActive(TokenZreo, active, nonce)).to.revertedWith(
        'SafeOwnableUpgradeable: operation not in pending'
      );
      const refundHash = web3.utils.hexToBytes(
        await User.Proxy.getInjectActiveHash(TokenZreo, active, User.address, nonce)
      );
      const Sig1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(refundHash));
      const Sig2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundHash));
      const sendHash = web3.utils.hexToBytes(
        await User.Proxy.getInjectActiveHashToSign(TokenZreo, active, User.address, nonce)
      );
      await Administrator1.Proxy.AddOpHashToPending(sendHash, [Sig1, Sig2]);
      await expect(User.Proxy.injectActive(TokenZreo, active, nonce))
        .to.emit(Proxy, 'Activation')
        .withArgs(TokenZreo, active, false);

      // When the active value is full, the parcel status is automatically activated
      const TokenOne = 1;
      await Administrator1.Proxy.awardItem(Administrator1.address, TestConditions, TokenURI);
      expect(await Proxy.ownerOf(TokenOne)).to.eq(Administrator1.address);
      const refundHash2 = web3.utils.hexToBytes(
        await User.Proxy.getInjectActiveHash(TokenOne, TestConditions, User.address, nonce)
      );
      const Sig2_2 = web3.utils.hexToBytes(await Administrator2.Proxy.signer.signMessage(refundHash2));
      const sendHash2 = web3.utils.hexToBytes(
        await User.Proxy.getInjectActiveHashToSign(TokenOne, TestConditions, User.address, nonce)
      );
      await Administrator1.Proxy.AddOpHashToPending(sendHash2, [Sig2_2]);
      await expect(User.Proxy.injectActive(TokenOne, TestConditions, nonce))
        .to.emit(Proxy, 'Activation')
        .withArgs(TokenOne, TestConditions, true);
    });
  });
});
