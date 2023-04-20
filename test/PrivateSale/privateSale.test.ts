import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {PrivateSale, VM3, MockAggregatorV3} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';

const setup = deployments.createFixture(async () => {
  const chainId = 1;
  const {deployer, Administrator1} = await getNamedAccounts();

  const VM3Factory = await ethers.getContractFactory('VM3');
  const vm3 = await VM3Factory.deploy(chainId, 1000000, deployer, [deployer, Administrator1], 2, {});
  const usdt = await VM3Factory.deploy(chainId, 1000000, deployer, [deployer, Administrator1], 2, {});
  const weth = await VM3Factory.deploy(chainId, 1000000, deployer, [deployer, Administrator1], 2, {});

  const MockAggregatorFactory = await ethers.getContractFactory('MockAggregatorV3');
  const ethPriceFeed = await MockAggregatorFactory.deploy(8, '', 1);

  const PrivateSaleFactory = await ethers.getContractFactory('PrivateSale');
  const privateSale = await PrivateSaleFactory.deploy([deployer, Administrator1], 2, vm3.address, usdt.address, {});

  const contracts = {
    PrivateSale: <PrivateSale>privateSale,
    USDT: <VM3>usdt,
    VM3: <VM3>vm3,
    ETHPriceFeed: <MockAggregatorV3>ethPriceFeed,
    WETH: <VM3>weth,
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    deployer: await setupUser(deployer, contracts),
    Administrator1: await setupUser(Administrator1, contracts),
  };
});

describe('PrivateSale', () => {
  describe('Add tokens check', () => {
    it('Should can add valid tokens', async () => {
      const {PrivateSale, VM3, USDT, deployer, Administrator1, ETHPriceFeed, WETH} = await setup();
      expect(await PrivateSale.USDT()).to.be.equal(USDT.address);
      expect(await PrivateSale.VM3()).to.be.equal(VM3.address);

      const nonce = await PrivateSale.nonce();
      const addTokensHash = await ethers.utils.solidityKeccak256(
        ['string', 'bytes32', 'address', 'address', 'uint256'],
        [
          await PrivateSale.DOMAIN(),
          ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes('keccak256("addPaymentToken(address paymentToken,address paymentTokenPriceFeed)")')
          ),
          WETH.address,
          ETHPriceFeed.address,
          nonce,
        ]
      );
      const sig2 = await Administrator1.PrivateSale.signer.signMessage(web3.utils.hexToBytes(addTokensHash));
      ETHPriceFeed.setRoundData(1200 * 100000000);
      await expect(deployer.PrivateSale.addPaymentToken(WETH.address, ETHPriceFeed.address, [sig2]))
        .to.emit(PrivateSale, 'NewPaymentTokenAdded')
        .withArgs(WETH.address, ETHPriceFeed.address);

      expect(await PrivateSale.paymentTokenPriceFeedMap(WETH.address)).to.be.eq(ETHPriceFeed.address);
    });
  });
});
