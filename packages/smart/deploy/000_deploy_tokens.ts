import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { makeSigner } from "../tasks";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments } = hre;

  const signer = await makeSigner(hre);
  const deployer = await signer.getAddress();

  await deployments.deploy("Collateral", {
    contract: "Cash",
    from: deployer,
    args: ["USDC", "USDC", 6],
    log: true,
  });

  await deployments.deploy("Reputation", {
    contract: "Cash",
    from: deployer,
    args: ["REPv2", "REPv2", 18],
    log: true,
  });
};

func.tags = ["Tokens"];

export default func;