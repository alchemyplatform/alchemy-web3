# Alchemy Web3

Web3 client extended with Alchemy and Metamask integration.

## Usage

```ts
import { createAlchemyWeb3 } from "alchemy-web3";

const ALCHEMY_URL = "https://eth-mainnet.alchemyapi.io/jsonrpc/<api-key>";

// Initialize with your app's URL.
const web3 = createAlchemyWeb3(ALCHEMY_URL);

// Web3 APIs talk to Alchemy.
web3.eth.getBlock("latest");

// APIs involving signing use Metamask if the user has it installed.
web3.eth.accounts.sign(data, privateKey);

// Alchemy-specific APIs are available as well.
web3.alchemy.getAccountBalances(address, contractAddresses);
```
