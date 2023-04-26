import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {MockPrivateSale, VM3} from '../../typechain';
import {setupUser, setupUsers} from '../utils';
import web3 from 'web3';
import {time} from '@nomicfoundation/hardhat-network-helpers';

const day = 60 * 60 * 24;
const month = day * 30;

const setup = deployments.createFixture(async () => {
  const {deployer, Administrator1, Administrator2} = await getNamedAccounts();

  const VM3Factory = await ethers.getContractFactory('VM3');
  const vm3 = await VM3Factory.deploy(5000 * 10000, deployer, [Administrator1, Administrator2], 2, {});
  const usdt = await VM3Factory.deploy(5000 * 10000, deployer, [Administrator1, Administrator2], 2, {});
  const busd = await VM3Factory.deploy(5000 * 10000, deployer, [Administrator1, Administrator2], 2, {});

  const PrivateSaleFactory = await ethers.getContractFactory('MockPrivateSale');
  const privateSale = await PrivateSaleFactory.deploy([Administrator1, Administrator2], 2, vm3.address, usdt.address);

  const contracts = {
    PrivateSale: <MockPrivateSale>privateSale,
    USDT: <VM3>usdt,
    VM3: <VM3>vm3,
    BUSD: <VM3>busd,
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

describe('PrivateSale', () => {
  it('Should can add valid tokens', async () => {
    const {PrivateSale, VM3, USDT, BUSD, Administrator2, Administrator1} = await setup();
    expect(await PrivateSale.paymentTokenMap(USDT.address)).to.be.equal(true);
    expect(await PrivateSale.VM3()).to.be.equal(VM3.address);

    expect(await PrivateSale.paymentTokenMap(BUSD.address)).to.be.equal(false);
    const nonce = await PrivateSale.nonce();
    const setPaymentTokenHash = ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32', 'address', 'bool', 'uint256'],
      [
        await PrivateSale.DOMAIN(),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('setPaymentToken(address paymentToken,bool enable)')),
        BUSD.address,
        true,
        nonce,
      ]
    );
    const sig2 = await Administrator2.PrivateSale.signer.signMessage(web3.utils.hexToBytes(setPaymentTokenHash));
    await Administrator1.PrivateSale.setPaymentToken(BUSD.address, true, [sig2]);
    expect(await PrivateSale.paymentTokenMap(BUSD.address)).to.be.equal(true);
  });

  it('Core logic', async () => {
    const {PrivateSale, deployer, users, VM3, USDT, BUSD, Administrator2, Administrator1} = await setup();

    //create sale
    const saleNumber1 = 2007;
    const saleAmount1 = ethers.utils.parseEther('10000000');
    const salePrice1 = ethers.utils.parseEther('0.5');
    const saleMaxBuy1 = ethers.utils.parseEther('10000');
    const saleMinBuy1 = ethers.utils.parseEther('0.1');
    const startTime1 = (await time.latest()) + day;
    const endTime1 = startTime1 + day * 3;
    const releaseStartTime1 = endTime1 + day * 4;
    const releaseTotalMonths1 = 12;
    const nonce = await PrivateSale.nonce();
    const createSale1Hash = ethers.utils.solidityKeccak256(
      [
        'bytes32',
        'bytes32',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint64',
        'uint64',
        'uint64',
        'uint32',
        'uint256',
      ],
      [
        await PrivateSale.DOMAIN(),
        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(
            'createSale(uint256 saleNumber,uint256 limitAmount,uint256 price,uint256 maxBuy,uint256 minBuy,uint64 startTime,uint64 endTime,uint64 releaseStartTime,uint32 releaseTotalMonths)'
          )
        ),
        saleNumber1,
        saleAmount1,
        salePrice1,
        saleMaxBuy1,
        saleMinBuy1,
        startTime1,
        endTime1,
        releaseStartTime1,
        releaseTotalMonths1,
        nonce,
      ]
    );
    const Admin2CreateSaleSig = await Administrator2.PrivateSale.signer.signMessage(
      web3.utils.hexToBytes(createSale1Hash)
    );
    await expect(
      Administrator1.PrivateSale.createSale(
        saleNumber1,
        saleAmount1,
        salePrice1,
        saleMaxBuy1,
        saleMinBuy1,
        [startTime1, endTime1, releaseStartTime1],
        releaseTotalMonths1,
        [Admin2CreateSaleSig]
      )
    )
      .to.be.emit(PrivateSale, 'SaleCreated')
      .withArgs(Administrator1.address, saleNumber1, saleAmount1, salePrice1);
    // inject saleAmount1 to privateSale contract for selling
    await deployer.VM3.transfer(PrivateSale.address, saleAmount1);

    // init user1/user2
    const user1 = users[8];
    const user2 = users[9];
    await deployer.VM3.transfer(PrivateSale.address, saleAmount1);
    await deployer.USDT.transfer(user1.address, ethers.utils.parseEther('20000'));
    await deployer.USDT.transfer(user2.address, ethers.utils.parseEther('20000'));

    // add user1/user2 to  white list
    const nonce2 = await PrivateSale.nonce();
    const setWhiteListHash = ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32', 'uint256', 'address[]', 'bool', 'uint256'],
      [
        await PrivateSale.DOMAIN(),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('setWhiteList(uint256 saleNumber,address[] users,bool added)')),
        saleNumber1,
        [user1.address, user2.address],
        true,
        nonce2,
      ]
    );
    const Admin2SetWhiteListSig1 = await Administrator2.PrivateSale.signer.signMessage(
      web3.utils.hexToBytes(setWhiteListHash)
    );
    await expect(
      Administrator1.PrivateSale.setWhiteList(saleNumber1, [user1.address, user2.address], true, [
        Admin2SetWhiteListSig1,
      ])
    )
      .to.be.emit(PrivateSale, 'SetWhiteList')
      .withArgs(saleNumber1, [user1.address, user2.address], true);

    // set time, make sale begin
    await PrivateSale.setTimestamp(startTime1);

    // user1 pay 100 USDT for buying VM3
    const userPayamount = ethers.utils.parseEther('100');
    await user1.USDT.approve(PrivateSale.address, ethers.utils.parseEther('10000'));
    await expect(user1.PrivateSale.buy(saleNumber1, USDT.address, userPayamount))
      .to.be.emit(PrivateSale, 'BuyVM3')
      .withArgs(user1.address, saleNumber1, USDT.address, userPayamount, ethers.utils.parseEther('200'));

    //user pay  0.25 USDT for buying VM3
    const userPayamount2 = ethers.utils.parseEther('0.25');
    await expect(user1.PrivateSale.buy(saleNumber1, USDT.address, userPayamount2))
      .to.be.emit(PrivateSale, 'BuyVM3')
      .withArgs(user1.address, saleNumber1, USDT.address, userPayamount2, ethers.utils.parseEther('0.5'));

    //user pay  0 USDT, should be revert
    const userPayamount3 = ethers.utils.parseEther('0');
    await expect(user1.PrivateSale.buy(saleNumber1, USDT.address, userPayamount3)).to.be.revertedWith('');

    //user pay 100.25 USDT for buying VM3
    const userPayamount4 = ethers.utils.parseEther('100.25');
    await expect(user1.PrivateSale.buy(saleNumber1, USDT.address, userPayamount4))
      .to.be.emit(PrivateSale, 'BuyVM3')
      .withArgs(user1.address, saleNumber1, USDT.address, userPayamount4, ethers.utils.parseEther('200.5'));

    //user pay 1000 BUSD, should be revert
    const userPayamount5 = ethers.utils.parseEther('100');
    await expect(user1.PrivateSale.buy(saleNumber1, BUSD.address, userPayamount5)).to.be.revertedWith(
      'PrivateSale:PaymentToken is not supported'
    );

    //set time, make sale end
    await PrivateSale.setTimestamp(endTime1 + 1);
    await expect(user1.PrivateSale.buy(saleNumber1, USDT.address, ethers.utils.parseEther('100'))).to.be.revertedWith(
      'PrivateSale: Sale is not in progress'
    );

    // user try to release his VM3, should be reverted
    await expect(user1.PrivateSale.withdrawVM3([saleNumber1], user1.address)).to.be.revertedWith(
      'PrivateSale:sale release not start'
    );

    // set time, make sale begin
    await PrivateSale.setTimestamp(startTime1);
    await user2.USDT.approve(PrivateSale.address, ethers.utils.parseEther('10000'));
    expect(await USDT.allowance(user2.address, PrivateSale.address)).to.be.eq(ethers.utils.parseEther('10000'));
    await user2.PrivateSale.buy(saleNumber1, USDT.address, ethers.utils.parseEther('600'));
    //set time, make sale release begin
    await PrivateSale.setTimestamp(releaseStartTime1 + month);
    await user2.PrivateSale.withdrawVM3([saleNumber1], user2.address);
    expect((await PrivateSale.userAssetInfos(user2.address, saleNumber1)).amountWithdrawn).to.be.eq(
      ethers.utils.parseEther('100')
    );
    //set time, over 12 months, can release 11 months VM3 ;
    await PrivateSale.setTimestamp(releaseStartTime1 + month * 12);
    await user2.PrivateSale.withdrawVM3([saleNumber1], user2.address);
    expect((await PrivateSale.userAssetInfos(user2.address, saleNumber1)).amountWithdrawn).to.be.eq(
      ethers.utils.parseEther('1200')
    );
  });
});
