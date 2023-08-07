import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { PromotionV1, TestERC20 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';
import web3 from 'web3';

const ContractName = "PromotionV1";

const TestPromotion: PromotionV1.PromotionStruct = {
  publisher: '',
  name_: 'test',
  description_: 'test promotion',
  time_frame: '{"begin":"2022-01-01"}',
  tasks: '[{"xxx":"xxx"}]',
  conditions: '',
  rewards: {
    open_method: 0,
    receive_method: 0,
    chain_id: '1',
    chain_name: 'Ethereum',
    prizes_erc20_same: {
      addr: [],
      number: []
    },
    prizes_erc20_separate: {
      addr: [],
      min: [],
      max: []
    }
  }
}

const setup = deployments.createFixture(async () => {
  const token = "TestERC20"
  await deployments.fixture(ContractName);
  await deployments.fixture(token);
  const contracts = {
    Promotion: <PromotionV1>await ethers.getContract(ContractName),
    Token: <TestERC20>await ethers.getContract(token),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  const { deployer, Administrator1, Administrator2 } = await getNamedAccounts();
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
  };
});

describe(`${ContractName} Testing........`, async () => {
  it('basic information', async () => {
    const { Promotion } = await setup();
    expect(Promotion.address).to.be.not.eq("");
  });

  it('publishing a task', async () => {
    const poolNum = 10000;
    const { deployer, Token, Promotion } = await setup();
    const TestPrize20: PromotionV1.Prize20SAMEStruct = {
      addr: [Token.address],
      number: [poolNum]
    }
    TestPromotion.publisher = deployer.address;
    TestPromotion.rewards.prizes_erc20_same = TestPrize20;

    deployer.Token.approve(Promotion.address, poolNum)

    const id = await deployer.Promotion.current();
    expect(await deployer.Promotion.current()).to.eq("0x01");
    await expect(deployer.Promotion.releasePromotion(TestPromotion, TestPrize20))
      .to.emit(Promotion, 'ReleasePromotion')
      .withArgs(deployer.address, id);
    expect(await deployer.Promotion.current()).to.eq("0x02");
  });
  it('receive a reward for SAME', async () => {
    const reward = 5000;
    const poolNum = 10000;
    const receive_method = 0;
    const { deployer, Administrator1, Administrator2, Token, Promotion } = await setup();
    const TestPrize20: PromotionV1.Prize20SAMEStruct = {
      addr: [Token.address],
      number: [poolNum]
    }
    TestPromotion.publisher = deployer.address;
    TestPromotion.rewards.prizes_erc20_same = {
      addr: [Token.address],
      number: [reward]
    };

    deployer.Token.approve(Promotion.address, poolNum)

    const id = await deployer.Promotion.current();

    await expect(deployer.Promotion.releasePromotion(TestPromotion, TestPrize20))
      .to.emit(Promotion, 'ReleasePromotion')
      .withArgs(deployer.address, id);

    let nonce = 1;
    let RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSameHash(id, nonce, deployer.address));
    let Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    let Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    let signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSame(id, nonce, signs))
      .to.emit(Promotion, 'ClaimReward')
      .withArgs(deployer.address, id, receive_method, reward);

    nonce = 2;
    RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSameHash(id, nonce, deployer.address));
    Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSame(id, nonce, signs))
      .to.emit(Promotion, 'ClaimReward')
      .withArgs(deployer.address, id, receive_method, reward);

    nonce = 3;
    RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSameHash(id, nonce, deployer.address));
    Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSame(id, nonce, signs)).to.revertedWith(
      'reward has been claimed'
    );

    nonce = 4;
    const rewards = [reward];
    RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSeparateHash(id, rewards, nonce, deployer.address));
    Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSeparate(id, rewards, nonce, signs)).to.revertedWith(
      'not have the separate type of prize'
    );
  });
  it('receive a reward for SEPARATE', async () => {
    const min = 4000;
    const max = 5000;
    const poolNum = 10000;
    let remaining = poolNum;
    const receive_method = 1;
    const { deployer, Administrator1, Administrator2, Token, Promotion } = await setup();
    const TestPrize20: PromotionV1.Prize20SAMEStruct = {
      addr: [Token.address],
      number: [poolNum]
    }
    TestPromotion.publisher = deployer.address;
    TestPromotion.rewards.receive_method = receive_method;
    TestPromotion.rewards.prizes_erc20_separate = {
      addr: [Token.address],
      min: [min],
      max: [max]
    };

    deployer.Token.approve(Promotion.address, poolNum)

    const id = await deployer.Promotion.current();
    await expect(deployer.Promotion.releasePromotion(TestPromotion, TestPrize20))
      .to.emit(Promotion, 'ReleasePromotion')
      .withArgs(deployer.address, id);

    let reward = 5000
    let rewards = [reward];
    let nonce = 1;
    let RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSeparateHash(id, rewards, nonce, deployer.address));
    let Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    let Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    let signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSeparate(id, rewards, nonce, signs))
      .to.emit(Promotion, 'ClaimReward')
      .withArgs(deployer.address, id, receive_method, reward);
    remaining -= reward;
    await expect(deployer.Promotion.getRewardSeparate(id, rewards, nonce, signs)).to.revertedWith(
      'SafeOwnable: repetitive operation'
    );

    reward = 4000
    rewards = [reward];
    nonce = 2;
    RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSeparateHash(id, rewards, nonce, deployer.address));
    Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSeparate(id, rewards, nonce, signs))
      .to.emit(Promotion, 'ClaimReward')
      .withArgs(deployer.address, id, receive_method, reward);
    remaining -= reward;

    reward = 4000
    rewards = [reward];
    nonce = 3;
    RewardSameHash = web3.utils.hexToBytes(await Promotion.getRewardSeparateHash(id, rewards, nonce, deployer.address));
    Sign1 = web3.utils.hexToBytes(await Administrator1.Promotion.signer.signMessage(RewardSameHash));
    Sign2 = web3.utils.hexToBytes(await Administrator2.Promotion.signer.signMessage(RewardSameHash));
    signs = [Sign1, Sign2];
    await expect(deployer.Promotion.getRewardSeparate(id, rewards, nonce, signs))
      .to.emit(Promotion, 'ClaimReward')
      .withArgs(deployer.address, id, receive_method, remaining);
  });
});
