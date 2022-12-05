import { expect } from '../chai-setup';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { VM3 } from '../../typechain';
import { setupUser, setupUsers } from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('VM3');
  const { possessor, Administrator1, Administrator2 } = await getNamedAccounts();
  const contracts = {
    VM3: <VM3>await ethers.getContract('VM3'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    possessor: await setupUser(possessor, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
    Administrator2: await setupUser(Administrator2, contracts),
    TotalMint: '1000000',
  };
});

describe('VM3 Token', () => {
  describe('Ownable check', () => {
    it('owners check', async () => {
      const { VM3, Administrator1, Administrator2 } = await setup();
      const owners = await VM3.owners();
      expect(owners[1]).to.be.eq(Administrator1.address);
      expect(owners[2]).to.be.eq(Administrator2.address);
    });
    it('transferOwnership check', async () => {
      const { users, VM3, Administrator1 } = await setup();
      await expect(Administrator1.VM3.transferOwnership(users[0].address))
        .to.emit(VM3, 'OwnershipTransferred')
        .withArgs(Administrator1.address, users[0].address);
      const owners = await VM3.owners();

      expect(Administrator1.VM3.transferOwnership(users[0].address)).to.be.revertedWith(
        'SafeOwnable: caller is not the owner1'
      );
      expect(owners[1]).to.be.eq(users[0].address);
    });
  });

  describe('multiple signature check', () => {
    it('mint check', async () => {
      const { users, VM3, Administrator1, Administrator2 } = await setup();
      const nonce = await VM3.nonce();
      const to = users[0].address;
      const amount = 100;
      const mintHash = await VM3.getMintHash(to, amount, nonce);
      const sig2 = await Administrator2.VM3.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(Administrator1.VM3.mint(to, amount, [web3.utils.hexToBytes(sig2)]))
        .to.emit(VM3, 'Transfer')
        .withArgs(ethers.constants.AddressZero, to, amount);
      expect(await VM3.balanceOf(to)).to.be.eq(amount);
      expect(await VM3.nonce()).to.be.eq(nonce.add(1));

      //try to use singature again
      await expect(Administrator1.VM3.mint(to, amount, [web3.utils.hexToBytes(sig2)])).to.be.revertedWith(
        'SafeOwnable: signer is not owner'
      );
    });

    it('check insufficient signatures', async () => {
      const { users, VM3, Administrator1 } = await setup();
      const nonce = await VM3.nonce();
      const to = users[0].address;
      const amount = 100;
      const mintHash = await VM3.getMintHash(to, amount, nonce);
      const sig1 = await Administrator1.VM3.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(Administrator1.VM3.mint(to, amount, [web3.utils.hexToBytes(sig1)])).to.be.revertedWith(
        'SafeOwnable: no enough confirms'
      );
      expect(await VM3.balanceOf(to)).to.be.eq(0);
    });

    it('check strange signatures', async () => {
      const { users, VM3, Administrator1 } = await setup();

      const nonce = await VM3.nonce();
      const to = users[0].address;
      const amount = 200;
      const mintHash = await VM3.getMintHash(to, amount, nonce);
      const sig1 = await Administrator1.VM3.signer.signMessage(web3.utils.hexToBytes(mintHash));
      const sig2 = await users[0].VM3.signer.signMessage(web3.utils.hexToBytes(mintHash));
      await expect(
        Administrator1.VM3.mint(to, amount, [web3.utils.hexToBytes(sig1), web3.utils.hexToBytes(sig2)])
      ).to.be.revertedWith('SafeOwnable: signer is not owner');
      expect(await VM3.balanceOf(to)).to.be.eq(0);
    });
  });
});
