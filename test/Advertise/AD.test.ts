import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {Advertise} from '../../typechain';
import {setupUser, setupUsers} from '../utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('Advertise');
  const {owner, Administrator1, Administrator2} = await getNamedAccounts();
  const contracts = {
    Advertise: <Advertise>await ethers.getContract('Advertise'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner: await setupUser(owner, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
  };
});

describe('Advertise Token', () => {
  it('basic information', async () => {
    const {Advertise} = await setup();
    expect(await Advertise.name()).to.be.eq('Test AD');
    expect(await Advertise.symbol()).to.be.eq('TAD');
    // expect(await Advertise.totalSupply()).to.be.eq(parseEther(TotalMint));
  });
});
