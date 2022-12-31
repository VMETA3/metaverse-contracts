import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, network} from 'hardhat';
import {DrawingGame, GameItem, Investment, TestERC20} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import {time} from '@nomicfoundation/hardhat-network-helpers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('DrawingGame');
  const {deployer, interestAccount} = await getNamedAccounts();
  const contracts = {
    Investment: <Investment>await ethers.getContract('Investment'),
    TestToken: <TestERC20>await ethers.getContract('TestERC20'),
    DrawingGame: <DrawingGame>await ethers.getContract('DrawingGame'),
    TestNFT: <GameItem>await ethers.getContract('GameItem'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    interestAccount: await setupUser(interestAccount, contracts),
  };
});

describe('DrawingGame contract', function () {
  it('simple draw', async () => {
    const {DrawingGame, Investment, TestToken, deployer, users, interestAccount} = await setup();

    const testUser1 = users[0];

    // Add interest warehouse
    const interestWarehouse = ethers.utils.parseEther('10000');
    await deployer.TestToken.transfer(interestAccount.address, interestWarehouse);
    await interestAccount.TestToken.approve(Investment.address, interestWarehouse);
    await deployer.Investment.updateInterestWarehouse();
    expect(await TestToken.allowance(interestAccount.address, Investment.address)).to.be.eq(interestWarehouse);

    // Add investor
    const amount = ethers.utils.parseEther('100');
    await deployer.TestToken.transfer(testUser1.address, amount);
    expect(await TestToken.balanceOf(testUser1.address)).to.be.eq(amount);
    await testUser1.TestToken.approve(Investment.address, amount);
    await expect(testUser1.Investment.deposit(amount))
      .to.be.emit(Investment, 'Deposit')
      .withArgs(testUser1.address, amount);
    expect(await testUser1.Investment.getLevel(0)).to.be.eq(1);

    // Draw
    // modify network block timestamp
    await network.provider.send('evm_setNextBlockTimestamp', [1670116072]); //FIXME
    await expect(testUser1.DrawingGame.draw())
      .to.be.emit(DrawingGame, 'Draw')
      .withArgs(testUser1.address, time.latest());
  });
});
