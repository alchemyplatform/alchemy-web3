import { formatters } from "web3-core-helpers";
import { toNumber } from "web3-utils";

// web3-core-method exports both a function and a type called `Method`. Typescript defaults to importing the type rather than the function, so when I try to call it typescript will yell at me. So we use require instead.
/* tslint:disable-next-line */
const Method = require("web3-core-method");

interface PatchParams {
  name: string;
  call: string;
  params: [any];
  inputFormatter: any;
  outputFormatter: any;
}

export function patchEthFeeHistoryMethod(web3: any): void {
  web3.eth.customRPC = function (opts: PatchParams) {
    /* tslint:disable-next-line */
    const self = this;
    const newMethod = new Method({
      name: opts.name,
      call: opts.call,
      params: opts.params || 0,
      inputFormatter: opts.inputFormatter || null,
      outputFormatter: opts.outputFormatter || null,
    });
    newMethod.attachToObject(self);
    newMethod.setRequestManager(self._requestManager, self.accounts);
  };

  web3.eth.customRPC({
    name: "getFeeHistory",
    call: "eth_feeHistory",
    params: 3,
    inputFormatter: [
      toNumber,
      formatters.inputBlockNumberFormatter,
      (value: any) => value,
    ],
  });
}
