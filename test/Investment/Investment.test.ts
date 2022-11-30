import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, network} from 'hardhat';
import {Investment, TestERC20} from '../../typechain';
import {setupUser, setupUsers} from '../utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Investment');
  const {deployer, interestAccount} = await getNamedAccounts();
  const contracts = {
    Investment: <Investment>await ethers.getContract('Investment'),
    TestToken: <TestERC20>await ethers.getContract('TestERC20'),
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
describe('Investment', () => {
  it('normal deposit and withdraw check', async () => {
    const {Investment, TestToken, deployer, users, interestAccount} = await setup();
    const testUser1 = users[4];
    const amount = 100;
    const amount2 = 1000;
    const amount3 = 10000;
    const totalAmount = amount + amount2 + amount3;
    const interestHouse = totalAmount * 5;

    await deployer.TestToken.approve(interestAccount.address, interestHouse);
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
        .withArgs(testUser1.address, amount / 10);
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
        .withArgs(testUser1.address, amount2 / 10);
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
        .withArgs(testUser1.address, amount3 / 10);
    }
  });

  it('multiple investment in a month check', async () => {
    const {Investment, TestToken, deployer, users, interestAccount} = await setup();
    const testUser1 = users[4];
    const amount = 100;
    const amount2 = 1000;
    const amount3 = 10000;
    const totalAmount = amount + amount2 + amount3;
    const interestHouse = totalAmount * 5;

    await deployer.TestToken.approve(interestAccount.address, interestHouse);
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
        .withArgs(testUser1.address, totalAmount / 10);
    }
  });

  it('limit check', async () => {
    const {Investment, deployer, TestToken, users, interestAccount} = await setup();
    const testUser1 = users[4];
    const amount = 100;
    const amount2 = 50000;
    const totalAmount = amount + amount2;
    const interestHouse = totalAmount * 5;

    await deployer.TestToken.approve(interestAccount.address, interestHouse);
    await deployer.Investment.updateInterestWarehouse();

    // transfer some token to testUser1
    await deployer.TestToken.transfer(testUser1.address, totalAmount);
    expect(await TestToken.balanceOf(testUser1.address)).to.be.eq(totalAmount);

    await expect(testUser1.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount);

    await network.provider.send('evm_increaseTime', [SecondsForDay]);
    await expect(testUser1.Investment.deposit(amount2)).to.be.revertedWith('');

    const testUser2 = users[5];
    await deployer.TestToken.transfer(testUser2.address, amount);
    expect(await TestToken.balanceOf(testUser2.address)).to.be.eq(amount);
    await expect(testUser2.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser2.address, amount);
  });
});
