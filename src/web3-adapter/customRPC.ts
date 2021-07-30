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

export function patchEnableCustomRPC(web3: any): void {
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
}
