import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { time } from "@nomicfoundation/hardhat-network-helpers";


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployer} = await hre.getNamedAccounts();

  const Investment = await hre.deployments.get('Investment');
  

  const TestNFT = await  hre.deployments.deploy('GameItem', {
    from: deployer,
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  hre.deployments.log(`contract TestNFT deployed at ${TestNFT.address}`);


  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  const endTime = (await time.latest()) + ONE_YEAR_IN_SECS;

  const DrawingGame = await hre.deployments.deploy('DrawingGame', {
    from: deployer,
    args: [TestNFT.address, Investment.address, endTime],
  });

  hre.deployments.log(`contract DrawingGame deployed at ${DrawingGame.address}`);
};

export default func;
func.tags = ['DrawingGame'];
func.dependencies = ['TestNFT'];
func.dependencies = ['Investment'];
