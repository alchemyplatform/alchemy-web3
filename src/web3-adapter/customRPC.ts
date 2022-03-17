import Method from "web3-core-method";

interface PatchParams {
  name: string;
  call: string;
  params: [any];
  inputFormatter: any;
  outputFormatter: any;
}

const MethodFn: any = Method;

/**
 * Private method to enable adding custom RPC calls to the web3 object. This
 * allows the addition of custom endpoints to the web3 object.
 */
export function patchEnableCustomRPC(web3: any): void {
  web3.eth.customRPC = function (opts: PatchParams) {
    const newMethod = new MethodFn({
      name: opts.name,
      call: opts.call,
      params: opts.params || 0,
      inputFormatter: opts.inputFormatter || null,
      outputFormatter: opts.outputFormatter || null,
    });
    newMethod.attachToObject(this);
    newMethod.setRequestManager(this._requestManager, this.accounts);
  };
}
