import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts, upgrades } from 'hardhat';
import { setupUser, setupUsers } from '../utils';
import { RaffleBag, VRFCoordinatorV2Mock, GameItem, VM3 } from '../../typechain';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import web3 from 'web3';
import { BigNumber, BigNumberish } from 'ethers';
import { PromiseOrValue } from '../../typechain/common';

const TenthToken = ethers.BigNumber.from('100000000000000000');

const setup = deployments.createFixture(async () => {
  await deployments.fixture('RaffleBag');
  const { deployer, possessor, Administrator1, Administrator2 } = await getNamedAccounts();

  // NFT
  const NFT = await ethers.getContractFactory('GameItem');
  const BCard = await NFT.deploy();
  const CCard = BCard;

  const VRFCoordinatorV2MockFactory = await ethers.getContractFactory('VRFCoordinatorV2Mock');
  const VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(1, 1);

  const VRFCoordinatorV2MockInstance = <VRFCoordinatorV2Mock>VRFCoordinatorV2Mock;
  await VRFCoordinatorV2MockInstance.createSubscription();

  const ERC20Token = await ethers.getContract('VM3');
  const owners = [Administrator1, Administrator2];
  const signRequred = 2;

  const RaffleBag = await ethers.getContractFactory('RaffleBag');
  const RaffleBagProxy = await upgrades.deployProxy(RaffleBag, [
    owners,
    signRequred,
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
    ERC20Token: <VM3>ERC20Token,
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


const setPrizes = async (BCard: { awardItem: (arg0: any, arg1: string) => any; }, CCard: { awardItem: (arg0: any, arg1: string) => any; }, possessor: { address: any; }, Administrator1: { Proxy: { setPrizes: (arg0: number[], arg1: (number | BigNumber)[], arg2: number[], arg3: PromiseOrValue<BigNumberish>[][]) => any; }; }) => {
  const enumBCard = 0
  const enumCCard = 1
  const enumDCard = 2
  const enumERC20Token = 3
  const prizeKinds = [enumERC20Token, enumERC20Token, enumERC20Token, enumERC20Token, enumDCard, enumCCard, enumBCard];
  const amounts = [TenthToken.mul(2), TenthToken.mul(3), TenthToken.mul(6), TenthToken.mul(8), 0, 0, 0];
  const weights = [30000, 18000, 12000, 6000, 400, 8, 4];
  const CC_Number = 15;
  const BC_Number = 6
  const tokens: PromiseOrValue<BigNumberish>[][] = [];
  const BTokens = [];
  const CTokens = [];
  for (let i = 0; i < BC_Number; i++) {
    await BCard.awardItem(possessor.address, "This is a B-grade card");
    BTokens.push(i);
  }
  for (let i = 0; i < CC_Number; i++) {
    await CCard.awardItem(possessor.address, "This is a C-grade card");
    CTokens.push(i);
  }

  for (let i = 0; i < prizeKinds.length; i++) {
    if (i == 5) {
      tokens[i] = CTokens;
    } else if (i == 6) {
      tokens[i] = BTokens;
    } else {
      tokens[i] = [];
    }
  }

  await Administrator1.Proxy.setPrizes(prizeKinds, amounts, weights, tokens);
  return {
    prizeKinds,
    amounts,
    weights,
    tokens
  }
}

describe('RaffleBag contract', () => {
  describe('Basic parameter settings', async () => {
    it('setAsset', async () => {
      const { Proxy, ERC20Token, BCard, CCard, possessor, Administrator1 } = await setup();
      await Administrator1.Proxy.setAsset(possessor.address, ERC20Token.address, BCard.address, CCard.address);
      expect(await Proxy.spender()).to.be.equal(possessor.address);
      expect(await Proxy.BCard()).to.be.equal(BCard.address);
      expect(await Proxy.CCard()).to.be.equal(CCard.address);
      expect(await Proxy.ERC20Token()).to.be.equal(ERC20Token.address);
    });

    it('setPrizes', async () => {
      const { Proxy, BCard, CCard, possessor, Administrator1 } = await setup();
      const { prizeKinds, amounts, weights } = await setPrizes(BCard, CCard, possessor, Administrator1);
      const PrizesPool = await Proxy.getPrizePool();
      expect(PrizesPool.length).to.eq(prizeKinds.length);
      for (let i = 0; i < PrizesPool.length; i++) {
        expect(PrizesPool[i].prizeKind).to.eq(prizeKinds[i]);
        expect(PrizesPool[i].amount).to.eq(amounts[i]);
        expect(PrizesPool[i].weight).to.eq(weights[i]);
        // expect(PrizesPool[i].tokens).to.eq(tokens[i]);
        // console.log("No.", i, " | prizeKind:", PrizesPool[i].prizeKind, " | amount:", PrizesPool[i].amount, " | weight:", PrizesPool[i].weight, " | tokens:", PrizesPool[i].tokens);
      }
    });
  });

  describe('Complete various sweepstakes', async () => {
    it('Simple draw, win a BCard', async () => {
      const { Proxy, ERC20Token, BCard, CCard, VRFCoordinatorV2Mock, possessor, Administrator1, Administrator2, users } = await setup();
      await Administrator1.Proxy.setAsset(possessor.address, ERC20Token.address, BCard.address, CCard.address);
      await setPrizes(BCard, CCard, possessor, Administrator1);
      await Administrator1.Proxy.setChainlink(250000000, 1, ethers.constants.HashZero, 3);
      await possessor.ERC20Token.approve(Proxy.address, TenthToken.mul(100000));
      const User = users[6];
      const Nonce = 0;

      const Hash = await Proxy.drawHash(User.address, Nonce);
      const HashToBytes = web3.utils.hexToBytes(Hash);
      const Sign1 = web3.utils.hexToBytes(await Administrator1.Proxy.signer.signMessage(HashToBytes));
      const sendHash = web3.utils.hexToBytes(await Proxy.HashToSign(Hash))
      // Special emphasis!
      // When the caller is an administrator himself, it is not necessary to pass in the administrator's signature
      await Administrator2.Proxy.AddOpHashToPending(sendHash, [Sign1]);
      await User.Proxy.draw(Nonce);
      expect(await VRFCoordinatorV2Mock.s_nextRequestId()).to.be.equal(2);
      const Number = ethers.BigNumber.from('3241232351512')
      await expect(VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(1, Proxy.address, [Number]))
        .to.be.emit(VRFCoordinatorV2Mock, 'RandomWordsFulfilled')
        .withArgs(1, 1, 0, true);
      expect(await ERC20Token.balanceOf(User.address)).to.be.eq(TenthToken.mul(2))
    });
  });
});
