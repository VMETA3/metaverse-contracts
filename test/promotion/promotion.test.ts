import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { Promotion, TestERC20 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';

const ContractName = "promotion";

const TestPromotion: Promotion.PromotionStruct = {
  publisher: '',
  name_: 'test',
  description_: 'test promotion',
  time_frame: '{"begin":"2022-01-01"}',
  tasks: '[{"xxx":"xxx"}]',
  conditions: '',
  rewords: {
    open_method: 'FCFS',
    receive_method: 'Same Amount',
    chain_id: '1',
    chain_name: 'Ethereum',
    prizes_erc20: '[{"address":"0x123456", "Number":123456}]',
    prizes_erc721: '',
    prizes_wlist: '',
    prizes_wlist_str: ''
  }
}

const TestPrize20s: Promotion.Prize20Struct[] = [];

const setup = deployments.createFixture(async () => {
  const token = "TestERC20"
  await deployments.fixture(ContractName);
  await deployments.fixture(token);
  const contracts = {
    Promotion: <Promotion>await ethers.getContract(ContractName),
    Token: <TestERC20>await ethers.getContract(token),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  const { deployer } = await getNamedAccounts();
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
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
    const TestPrize20: Promotion.Prize20Struct = {
      addr: Token.address,
      number: poolNum
    }
    TestPrize20s.push(TestPrize20)
    TestPromotion.publisher = deployer.address;

    deployer.Token.approve(Promotion.address, poolNum)

    const id = await deployer.Promotion.current();
    await expect(deployer.Promotion.releasePromotion(TestPromotion, TestPrize20s))
      .to.emit(Promotion, 'ReleasePromotion')
      .withArgs(deployer.address, id);
  });
});
