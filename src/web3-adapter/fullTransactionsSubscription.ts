import { AbstractSubscription } from "web3-core-subscriptions";

export default class FullTransactionsSubscription extends AbstractSubscription {
  constructor(utils: any, formatters: any, moduleInstance: any) {
    super(
      "eth_subscribe",
      "alchemy_newFullPendingTransactions",
      null,
      utils,
      formatters,
      moduleInstance,
    );
  }

  public onNewSubscriptionItem(subscriptionItem: any) {
    return subscriptionItem;
  }
}
