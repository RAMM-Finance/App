// Instructions For Adding A New Environment
// 1. Copy this file under a new name in this directory.
// 2. Make any changes you want, so long as the Configuration type is adhered to.
// 3. Go to the index.ts file in this directory.
// 4. Import this file.
// 5. Add its name to the Environment type.
// 6. Add it to the exported environments object.

import { Configuration } from "../configuration";

const config: Configuration = {
  contractDeploy: {
    strategy: "test",
    rpcURL: "http://127.0.0.1:8545/",
    chainID: 31337,
  },
};
export default config;