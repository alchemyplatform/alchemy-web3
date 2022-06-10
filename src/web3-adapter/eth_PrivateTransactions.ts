export function patchEthPrivateTransactionMethods(web3: any): void {
  web3.eth.customRPC({
    name: "sendPrivateTransaction",
    call: "eth_sendPrivateTransaction",
    params: 3,
  });

  web3.eth.customRPC({
    name: "cancelPrivateTransaction",
    call: "eth_cancelPrivateTransaction",
    params: 1,
  });
}
