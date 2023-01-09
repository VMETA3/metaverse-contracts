import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, network, upgrades} from 'hardhat';
import {Investment, TestERC20} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import {time} from '@nomicfoundation/hardhat-network-helpers';

let startTime = 0;
let endTime = 0;

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Investment');
  const {deployer, interestAccount, Administrator2} = await getNamedAccounts();
  const owners = [deployer, Administrator2];

  const testToken = await ethers.getContract('TestERC20');

  startTime = (await time.latest()) - 10;
  endTime = (await time.latest()) + 24 * 60 * 60 * 1800;

  const InvestmentFactory = await ethers.getContractFactory('Investment');
  const Investment = await upgrades.deployProxy(InvestmentFactory, [
    'Investment',
    owners,
    2,
    testToken.address,
    interestAccount,
    startTime,
    endTime,
  ]);

  const contracts = {
    Investment: <Investment>Investment,
    TestToken: <TestERC20>testToken,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    interestAccount: await setupUser(interestAccount, contracts),
  };
});

const SecondsForDay = 60 * 60 * 24;
const SecondsForMonth = SecondsForDay * 30;
const OneToken = ethers.utils.parseEther('1');
const InvestmentLevelList = [
  {
    Level: 1,
    WithdrawTimes: 12,
  },
  {
    Level: 2,
    WithdrawTimes: 15,
  },
  {
    Level: 3,
    WithdrawTimes: 18,
  },
];
describe('Investment testing', () => {
  it('normal deposit and withdraw check', async () => {
    const {Investment, TestToken, deployer, users, interestAccount} = await setup();

    expect(await Investment.activityEndTime()).to.be.eq(endTime);

    const testUser1 = users[4];
    const amount = OneToken.mul(100);
    const amount2 = OneToken.mul(1000);
    const amount3 = OneToken.mul(10000);
    const totalAmount = amount.add(amount2.add(amount3));
    const interestHouse = totalAmount.mul(5);

    await deployer.TestToken.transfer(interestAccount.address, interestHouse);
    await interestAccount.TestToken.approve(Investment.address, interestHouse);
    await deployer.Investment.updateInterestWarehouse();

    // transfer some token to testUser1
    await deployer.TestToken.transfer(testUser1.address, totalAmount);
    expect(await TestToken.balanceOf(testUser1.address)).to.be.eq(totalAmount);
    // testUser1 approve Investment contract can transfer totalAmount token for testing
    await testUser1.TestToken.approve(Investment.address, totalAmount);

    // deposit amout, expect level 1
    const levelOne = InvestmentLevelList[0];
    await expect(testUser1.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount);
    expect(await testUser1.Investment.getLevel(0)).to.be.eq(levelOne.Level);
    for (let i = 0; i < levelOne.WithdrawTimes; i++) {
      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await expect(testUser1.Investment.withdraw())
        .to.be.emit(Investment, 'Withdraw')
        .withArgs(testUser1.address, amount.div(10));
    }

    // deposit amout2, expect level 2
    const levelTwo = InvestmentLevelList[1];
    await expect(testUser1.Investment.deposit(amount2))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount2);
    expect(await testUser1.Investment.getLevel(1)).to.be.eq(levelTwo.Level);
    for (let i = 0; i < levelTwo.WithdrawTimes; i++) {
      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await expect(testUser1.Investment.withdraw())
        .to.be.emit(Investment, 'Withdraw')
        .withArgs(testUser1.address, amount2.div(10));
    }

    // deposit amout3, expect level 3
    const levelThree = InvestmentLevelList[2];
    await expect(testUser1.Investment.deposit(amount3))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount3);
    expect(await testUser1.Investment.getLevel(2)).to.be.eq(levelThree.Level);
    for (let i = 0; i < levelThree.WithdrawTimes; i++) {
      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await expect(testUser1.Investment.withdraw())
        .to.be.emit(Investment, 'Withdraw')
        .withArgs(testUser1.address, amount3.div(10));
    }
  });

  it('multiple investment in a month check', async () => {
    const {Investment, TestToken, deployer, users, interestAccount} = await setup();
    const testUser1 = users[4];
    const amount = OneToken.mul(100);
    const amount2 = OneToken.mul(1000);
    const amount3 = OneToken.mul(10000);
    const totalAmount = amount.add(amount2.add(amount3));
    const interestHouse = totalAmount.mul(5);

    await deployer.TestToken.transfer(interestAccount.address, interestHouse);
    await interestAccount.TestToken.approve(Investment.address, interestHouse);
    await deployer.Investment.updateInterestWarehouse();

    // transfer some token to testUser1
    await deployer.TestToken.transfer(testUser1.address, totalAmount);
    expect(await TestToken.balanceOf(testUser1.address)).to.be.eq(totalAmount);
    // testUser1 approve Investment contract can transfer totalAmount token for testing
    await testUser1.TestToken.approve(Investment.address, totalAmount);

    const levelOne = InvestmentLevelList[0];
    const levelTwo = InvestmentLevelList[1];
    const levelThree = InvestmentLevelList[2];
    await expect(testUser1.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount);
    // deposit amout, expect level 1
    expect(await testUser1.Investment.getLevel(0)).to.be.eq(levelOne.Level);

    // wait for one day
    await network.provider.send('evm_increaseTime', [SecondsForDay]);
    // deposit amout2, expect become level 2
    await expect(testUser1.Investment.deposit(amount2))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount2);
    expect(await testUser1.Investment.getLevel(0)).to.be.eq(levelTwo.Level);

    // wait for one day
    await network.provider.send('evm_increaseTime', [SecondsForDay]);
    // deposit amout3, expect become level 3
    await expect(testUser1.Investment.deposit(amount3))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount3);
    expect(await testUser1.Investment.getLevel(0)).to.be.eq(levelThree.Level);

    //test total withdraw
    for (let i = 0; i < levelThree.WithdrawTimes; i++) {
      // modify network block timestamp
      await network.provider.send('evm_increaseTime', [SecondsForMonth + 1]);
      await expect(testUser1.Investment.withdraw())
        .to.be.emit(Investment, 'Withdraw')
        .withArgs(testUser1.address, totalAmount.div(10));
    }
  });

  it('limit check', async () => {
    const {Investment, deployer, TestToken, users, interestAccount} = await setup();
    const testUser1 = users[4];
    const amount = OneToken.mul(100);
    const amount2 = OneToken.mul(50000);
    const totalAmount = amount.add(amount2);
    const interestHouse = totalAmount.mul(5);

    await deployer.TestToken.transfer(interestAccount.address, interestHouse);
    await interestAccount.TestToken.approve(Investment.address, interestHouse);
    await deployer.Investment.updateInterestWarehouse();

    // transfer some token to testUser1
    await deployer.TestToken.transfer(testUser1.address, totalAmount);
    expect(await TestToken.balanceOf(testUser1.address)).to.be.eq(totalAmount);
    await testUser1.TestToken.approve(Investment.address, totalAmount);

    await expect(testUser1.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount);

    await network.provider.send('evm_increaseTime', [SecondsForDay]);
    await expect(testUser1.Investment.deposit(amount2)).to.be.revertedWith('');

    const testUser2 = users[5];
    await deployer.TestToken.transfer(testUser2.address, amount);
    expect(await TestToken.balanceOf(testUser2.address)).to.be.eq(amount);
    await testUser2.TestToken.approve(Investment.address, amount);
    await expect(testUser2.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser2.address, amount);
  });
});
