import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts, hardhatArguments} from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {PrivateSale} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  const {deployer} = await getNamedAccounts();
  const PrivateSaleFactory = await ethers.getContractFactory('PrivateSale');
  const privateSale = await PrivateSaleFactory.deploy({from: deployer});

  const contracts = {
    PrivateSale: privateSale,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
  };
});
