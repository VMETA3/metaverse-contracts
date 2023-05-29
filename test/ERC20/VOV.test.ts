import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {MockVOV} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import {time} from '@nomicfoundation/hardhat-network-helpers';

const TWO_DAYs = 2 * 24 * 60 * 60;
const ONE_WEEK = 7 * 24 * 60 * 60;

const setup = deployments.createFixture(async () => {
  await deployments.fixture('MockVOV');
  const {Administrator1, VOVMinter} = await getNamedAccounts();

  const VOVFactory = await ethers.getContractFactory('MockVOV');
  const vov = await VOVFactory.deploy(Administrator1, VOVMinter);

  const contracts = {
    VOV: <MockVOV>vov,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    Administrator1: await setupUser(Administrator1, contracts),
    VOVMinter: await setupUser(VOVMinter, contracts),
  };
});

describe('VOV', () => {
  it('Minter set', async () => {
    const {VOV, users, Administrator1, VOVMinter} = await setup();
    const newMinter = users[6];
    const badAccount = users[7];

    await VOVMinter.VOV.delayedMint(users[3].address, 1);
    await expect(newMinter.VOV.delayedMint(users[3].address, 1)).to.be.revertedWith('VOV:only minter can do');
    await expect(badAccount.VOV.updateMinter(newMinter.address)).to.be.revertedWith('Ownable: caller is not the owner');

    await Administrator1.VOV.updateMinter(newMinter.address);
    await expect(newMinter.VOV.delayedMint(users[3].address, 1)).to.be.revertedWith('VOV:only minter can do');
    await VOV.setTimestamp((await time.latest()) + TWO_DAYs);
    await newMinter.VOV.delayedMint(users[4].address, 1);
  });

  it('Delayed Mint', async () => {
    const {VOV, users, VOVMinter, Administrator1} = await setup();
    await VOVMinter.VOV.delayedMint(users[3].address, 1);
    await expect(VOVMinter.VOV.delayedMint(users[3].address, 1)).to.be.revertedWith('VOV:mint to recently');

    await VOV.setTimestamp((await time.latest()) + ONE_WEEK);
    await VOVMinter.VOV.delayedMint(users[3].address, 1);

    await Administrator1.VOV.closeMint();
    expect(await VOV.mintSwitch()).to.be.eq(false);
    await VOV.setTimestamp((await time.latest()) + ONE_WEEK);
    await expect(VOVMinter.VOV.delayedMint(users[3].address, 1)).to.be.revertedWith('VOV:mint closed');

    await VOV.increaseTimestamp(ONE_WEEK); // avoid mint recently
    expect(await VOV.mintSwitch()).to.be.eq(false);
    await Administrator1.VOV.openMint();
    //open mint, must wait two days
    await expect(VOVMinter.VOV.delayedMint(users[3].address, 1)).to.be.revertedWith('VOV:mint closed');
    // wait two days, can mint now
    await VOV.increaseTimestamp(TWO_DAYs);
    await VOVMinter.VOV.delayedMint(users[3].address, 1);

    //check balance
    expect(await VOV.balanceOf(users[3].address)).to.be.eq(2);
    await VOV.increaseTimestamp(ONE_WEEK);
    expect(await VOV.balanceOf(users[3].address)).to.be.eq(3);
    await users[3].VOV.transfer(users[4].address, 3);
  });
});
