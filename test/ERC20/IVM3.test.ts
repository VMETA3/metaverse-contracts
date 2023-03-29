import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {IVM3} from '../../typechain';
import {setupUser, setupUsers} from '../utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('IVM3');
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();
  const contracts = {
    IVM3: <IVM3>await ethers.getContract('IVM3'),
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

describe('VM3 Token', () => {
  describe('Ownable check', () => {
    it('owners check', async () => {
      const {IVM3, Administrator1, Administrator2} = await setup();
      const owners = await IVM3.owners();
      expect(owners[1]).to.be.eq(Administrator1.address);
      expect(owners[2]).to.be.eq(Administrator2.address);
    });
    it('transfer check', async () => {
      const {IVM3, Administrator1, Administrator2, deployer, users} = await setup();
      const to = users[4];
      await expect(deployer.IVM3.transfer(to.address, 1000)).to.be.revertedWith('');

      await Administrator1.IVM3.addToWhiteList(deployer.address);
      await expect(deployer.IVM3.transfer(to.address, 1000))
        .to.emit(IVM3, 'Transfer')
        .withArgs(deployer.address, to.address, 1000);

      await Administrator1.IVM3.removeFromWhiteList(deployer.address);
      await expect(deployer.IVM3.transfer(to.address, 1000)).to.be.revertedWith('');
    });
  });
});
