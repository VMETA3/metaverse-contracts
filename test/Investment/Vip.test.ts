import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, network, upgrades} from 'hardhat';
import {Vip, TestERC20} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import {time} from '@nomicfoundation/hardhat-network-helpers';

let startTime = 0;
let endTime = 0;

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Vip');
  await deployments.fixture('TestERC20');
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();

  const Vip = await ethers.getContractFactory('Vip');

  const signRequired = 2;
  const owners = [Administrator1, Administrator2];

  startTime = (await time.latest()) - 10;
  endTime = (await time.latest()) + SecondsForMonth * 12;

  const VipProxy = await upgrades.deployProxy(Vip, [owners, signRequired]);
  await VipProxy.deployed();

  const contracts = {
    ERC20Token: <TestERC20>await ethers.getContract('TestERC20'),
    Vip: <Vip>await ethers.getContract('Vip'),
    Proxy: <Vip>VipProxy,
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

const SecondsForDay = 60 * 60 * 24;
const SecondsForMonth = SecondsForDay * 30;
const OneToken = ethers.utils.parseEther('1');
const VipLevelList = [
  {
    level: 1,
    threshold: ethers.utils.parseEther('100'),
    numberLimit: ethers.utils.parseEther('2000'),
    currentNumber: 0,
  },
  {
    level: 2,
    threshold: ethers.utils.parseEther('1000'),
    numberLimit: ethers.utils.parseEther('700'),
    currentNumber: 0,
  },
  {
    level: 3,
    threshold: ethers.utils.parseEther('10000'),
    numberLimit: ethers.utils.parseEther('150'),
    currentNumber: 0,
  },
];
describe('Vip testing', () => {
  it('multiple Invest within 30 days', async () => {
    const {Proxy, ERC20Token, deployer, Administrator1, users} = await setup();
    // init
    await Administrator1.Proxy.setERC20(ERC20Token.address);
    await Administrator1.Proxy.setSpender(deployer.address);
    await Administrator1.Proxy.setActivityStartTime(startTime);
    await Administrator1.Proxy.setActivityEndTime(endTime);
    const levels = [VipLevelList[0].level, VipLevelList[1].level, VipLevelList[2].level];
    const thresholds = [VipLevelList[0].threshold, VipLevelList[1].threshold, VipLevelList[2].threshold];
    const numberLimits = [VipLevelList[0].numberLimit, VipLevelList[1].numberLimit, VipLevelList[2].numberLimit];
    const currentNumbers = [
      VipLevelList[0].currentNumber,
      VipLevelList[1].currentNumber,
      VipLevelList[2].currentNumber,
    ];
    await Administrator1.Proxy.setLevelArrayAll(levels, thresholds, numberLimits, currentNumbers);

    const testUser1 = users[4];
    const amount = OneToken.mul(100);
    const amount2 = OneToken.mul(1000);
    const amount3 = OneToken.mul(10000);
    const totalAmount = amount.add(amount2.add(amount3));

    // transfer some token to testUser1
    await deployer.ERC20Token.transfer(testUser1.address, totalAmount);
    expect(await ERC20Token.balanceOf(testUser1.address)).to.be.eq(totalAmount);
    // testUser1 approve Vip contract can transfer totalAmount token for testing
    await testUser1.ERC20Token.approve(Proxy.address, totalAmount);

    // deposit is not enough money, expect reverted
    await expect(testUser1.Proxy.deposit(OneToken)).to.be.revertedWith('Vip: level threshold not reached');

    // deposit amout, expect level 1
    const levelOne = VipLevelList[0];
    await expect(testUser1.Proxy.deposit(amount)).to.be.emit(Proxy, 'Deposit').withArgs(testUser1.address, amount);
    expect(await testUser1.Proxy.getLevel(testUser1.address)).to.be.eq(levelOne.level);

    // deposit is not enough to upgrade money, expect reverted
    await expect(testUser1.Proxy.deposit(amount)).to.be.revertedWith('Vip: level threshold not reached');

    // deposit amout2, expect level 2
    const levelTwo = VipLevelList[1];
    await expect(testUser1.Proxy.deposit(amount2)).to.be.emit(Proxy, 'Deposit').withArgs(testUser1.address, amount2);
    expect(await testUser1.Proxy.getLevel(testUser1.address)).to.be.eq(levelTwo.level);

    // deposit amout3, expect level 3
    const levelThree = VipLevelList[2];
    await expect(testUser1.Proxy.deposit(amount3)).to.be.emit(Proxy, 'Deposit').withArgs(testUser1.address, amount3);
    expect(await testUser1.Proxy.getLevel(testUser1.address)).to.be.eq(levelThree.level);
  });

  it('the vip is full and cannot be invested', async () => {
    const {Proxy, ERC20Token, deployer, Administrator1, users} = await setup();
    // init
    await Administrator1.Proxy.setERC20(ERC20Token.address);
    await Administrator1.Proxy.setSpender(deployer.address);
    await Administrator1.Proxy.setActivityStartTime(startTime);
    await Administrator1.Proxy.setActivityEndTime(endTime);
    const levels = [VipLevelList[0].level, VipLevelList[1].level, VipLevelList[2].level];
    const thresholds = [VipLevelList[0].threshold, VipLevelList[1].threshold, VipLevelList[2].threshold];
    const numberLimits = [VipLevelList[0].numberLimit, VipLevelList[1].numberLimit, VipLevelList[2].numberLimit];
    const currentNumbers = [VipLevelList[0].numberLimit, VipLevelList[1].numberLimit, VipLevelList[2].numberLimit];
    await Administrator1.Proxy.setLevelArrayAll(levels, thresholds, numberLimits, currentNumbers);

    const testUser1 = users[4];
    const amount = OneToken.mul(100);

    // transfer some token to testUser1
    await deployer.ERC20Token.transfer(testUser1.address, amount);
    expect(await ERC20Token.balanceOf(testUser1.address)).to.be.eq(amount);
    // testUser1 approve Vip contract can transfer totalAmount token for testing
    await testUser1.ERC20Token.approve(Proxy.address, amount);

    // testUser1 deposit amout, expect reverted
    await expect(testUser1.Proxy.deposit(amount)).to.be.revertedWith('Vip: exceed the number of people limit');
  });

  it('get contract information', async () => {
    const {Proxy, ERC20Token, deployer, Administrator1, users} = await setup();
    // init
    await Administrator1.Proxy.setERC20(ERC20Token.address);
    await Administrator1.Proxy.setSpender(deployer.address);
    await Administrator1.Proxy.setActivityStartTime(startTime);
    await Administrator1.Proxy.setActivityEndTime(endTime);
    const levels = [VipLevelList[0].level, VipLevelList[1].level, VipLevelList[2].level];
    const thresholds = [VipLevelList[0].threshold, VipLevelList[1].threshold, VipLevelList[2].threshold];
    const numberLimits = [VipLevelList[0].numberLimit, VipLevelList[1].numberLimit, VipLevelList[2].numberLimit];
    const currentNumbers = [
      VipLevelList[0].currentNumber,
      VipLevelList[1].currentNumber,
      VipLevelList[2].currentNumber,
    ];
    await Administrator1.Proxy.setLevelArrayAll(levels, thresholds, numberLimits, currentNumbers);

    const testUser1 = users[4];
    const testUser2 = users[5];
    const testUser3 = users[6];
    const amount = OneToken.mul(100);
    const amount2 = OneToken.mul(1000);
    const amount3 = OneToken.mul(10000);
    const totalAmount = amount.add(amount2.add(amount3));

    // transfer some token to testUser1、testUser2、testUser3
    await deployer.ERC20Token.transfer(testUser1.address, amount);
    await deployer.ERC20Token.transfer(testUser2.address, amount2);
    await deployer.ERC20Token.transfer(testUser3.address, amount3);
    expect(await ERC20Token.balanceOf(testUser1.address)).to.be.eq(amount);
    expect(await ERC20Token.balanceOf(testUser2.address)).to.be.eq(amount2);
    expect(await ERC20Token.balanceOf(testUser3.address)).to.be.eq(amount3);
    // testUser1 approve Vip contract can transfer totalAmount token for testing
    await testUser1.ERC20Token.approve(Proxy.address, amount);
    await testUser2.ERC20Token.approve(Proxy.address, amount2);
    await testUser3.ERC20Token.approve(Proxy.address, amount3);

    // testUser1 deposit amout, expect level 1
    const levelOne = VipLevelList[0];
    await expect(testUser1.Proxy.deposit(amount)).to.be.emit(Proxy, 'Deposit').withArgs(testUser1.address, amount);
    expect(await testUser1.Proxy.getLevel(testUser1.address)).to.be.eq(levelOne.level);

    // deposit to testUser2 amout, expect level 2
    const levelTwo = VipLevelList[1];
    await expect(testUser1.Proxy.depositTo(testUser2.address, amount2))
      .to.be.emit(Proxy, 'Deposit')
      .withArgs(testUser2.address, amount2);
    expect(await testUser1.Proxy.getLevel(testUser2.address)).to.be.eq(levelTwo.level);

    // deposit to testUser3 amout, expect level 3
    const levelThree = VipLevelList[2];
    await expect(testUser1.Proxy.depositTo(testUser3.address, amount3))
      .to.be.emit(Proxy, 'Deposit')
      .withArgs(testUser3.address, amount3);
    expect(await testUser1.Proxy.getLevel(testUser3.address)).to.be.eq(levelThree.level);

    // check getLatestList function
    expect((await testUser1.Proxy.getLatestList()).toString()).to.be.eq(
      `${testUser1.address},1,${testUser2.address},2,${testUser3.address},3`
    );

    // check getLevelArray function
    expect((await testUser1.Proxy.getLevelArray()).toString()).to.be.eq(
      `${VipLevelList[0].level},${VipLevelList[0].threshold},${VipLevelList[0].numberLimit},1,${VipLevelList[1].level},${VipLevelList[1].threshold},${VipLevelList[1].numberLimit},1,${VipLevelList[2].level},${VipLevelList[2].threshold},${VipLevelList[2].numberLimit},1`
    );
  });
});
