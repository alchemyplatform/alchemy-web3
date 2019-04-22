# Alchemy Web3

Web3 client extended with Alchemy and Metamask integration.

## Introduction

Alchemy Web3 provides website authors with a drop-in replacement for the
[web3.js](https://github.com/ethereum/web3.js) Ethereum API client. It produces
a client matching that of web3.js, but brings two advantages to take advantage
of [Alchemy API](https://alchemyapi.io):

- **Uses Alchemy or Metamask for requests as needed.** Most requests will be
  sent through Alchemy, but requests involving signing and sending transactions
  are sent via [Metamask](https://metamask.io/) if the user has it installed.

- **Easy access to Alchemy's higher-order APIs.** The client exposes methods to
  call Alchemy's exclusive features.

Alchemy Web3 is designed to require minimal configuration so you can start using
it in your app right away.

## Installation

With Yarn:

```
yarn add @alch/alchemy-web3
```

Or with NPM:

```
npm install @alch/alchemy-web3
```

You will also need an Alchemy account to access the Alchemy API. If you don't
have one yet, [contact Alchemy](mailto:hello@alchemyapi.io) to request one.

## Usage

### Basic Usage

Create the client by importing the function `createAlchemyWeb3` and then passing
it your Alchemy app's URL:

```ts
import { createAlchemyWeb3 } from "@alch/alchemy-web3";

const ALCHEMY_URL = "https://eth-mainnet.alchemyapi.io/jsonrpc/<api-key>";

const web3 = createAlchemyWeb3(ALCHEMY_URL);
```

You can use any of the methods described in the [web3.js
API](https://web3js.readthedocs.io/en/1.0/) and they will send requests to
Alchemy:

```ts
// Many web3.js methods return promises.
web3.eth.getBlock("latest").then(block => {
  /* … */
});

web3.eth
  .estimateGas({
    from: "0xge61df…",
    to: "0x087a5c…",
    data: "0xa9059c…",
    gasPrice: "0xa994f8…",
  })
  .then(gasAmount => {
    /* … */
  });
```

### With Metamask

If the user has [Metamask](https://metamask.io/) enabled in their browser, then
any methods which involve user accounts or signing will automatically use the
provider from Metamask, as [described in Metamask's
docs](https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider).
However, for this to work **you must first request permission from the user to
access their accounts in Metamask**. This is a security restriction required by
Metamask: details can be found
[here](https://medium.com/metamask/https-medium-com-metamask-breaking-change-injecting-web3-7722797916a8).

To enable the use of Metamask, you must call
[`ethereum.enable()`](<https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider#ethereum.enable()>).
An example of doing so is as follows:

```ts
if (window.ethereum) {
  ethereum
    .enable()
    .then(accounts => {
      // Metamask is ready to go!
    })
    .catch(reason => {
      // Handle error. Likely the user rejected the login.
    });
} else {
  // The user doesn't have Metamask installed.
}
```

Note that doing so will display a Metamask dialog to the user if they have not
already seen it and accepted, so you may choose to wait to enable Metamask until
the user is about to perform an action which requires it. This is also why
Alchemy Web3 will not automatically enable Metamask on page load.

After enabling Metamask, any Web3 methods that involve accounts or signing will
automatically use it. For example:

```ts
async function doTransaction() {
  // Will return an empty array if Metamask has not been enabled!
  const accounts = await web3.eth.getAccounts();

  // This call will open a Metamask dialog asking the user to approve the
  // transaction of 1 ETH to the given address.
  await web3.eth.sendTransaction({
    from: accounts[0],
    to: "0x6A823E…",
    value: "1000000000000000000",
  });
}
```

## Alchemy Higher-Order APIs

The produced client also grants easy access to Alchemy's higher-order APIs.
Currently, this is the following method.

### `web3.alchemy.tokenBalances(address, contractAddresses)`

Returns token balances for a specific address given a list of contracts.

**Parameters:**

- `address`: The address for which token balances will be checked.
- `contractAddresses`: An array of contract addresses.

**Returns:**

An object with the following fields:

- `address`: The address for which token balances were checked.
- `tokenBalances`: An array of token balance objects. Each object contains:
  - `contractAddress`: The address of the contract.
  - `tokenBalance`: The balance of the contract, as a hexidecimal string.
  - `error`: An error string. One of this or `tokenBalance` will be `null`.

Copyright © 2019 Alchemy Insights Inc.
