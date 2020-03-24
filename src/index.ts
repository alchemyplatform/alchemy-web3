import Web3 from "web3";
import { Log, Transaction } from "web3-core";
import { BlockHeader, Eth, LogsOptions, Subscription, Syncing } from "web3-eth";
import { hexToNumberString } from "web3-utils";
import { AlchemyWeb3Config, FullConfig, Provider, Web3Callback } from "./types";
import { callWhenDone } from "./util/promises";
import { makeAlchemyContext } from "./web3-adapter/alchemyContext";
import FullTransactionsSubscription from "./web3-adapter/fullTransactionsSubscription";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL = 1000;
const DEFAULT_RETRY_JITTER = 250;

export interface AlchemyWeb3 extends Web3 {
  alchemy: AlchemyMethods;
  eth: AlchemyEth;
  setWriteProvider(provider: Provider | null | undefined): void;
}

export interface AlchemyMethods {
  getTokenAllowance(
    params: TokenAllowanceParams,
    callback?: Web3Callback<TokenAllowanceResponse>,
  ): Promise<TokenAllowanceResponse>;
  getTokenBalances(
    address: string,
    contractAddresses: string[],
    callback?: Web3Callback<TokenBalancesResponse>,
  ): Promise<TokenBalancesResponse>;
  getTokenMetadata(
    address: string,
    callback?: Web3Callback<TokenMetadataResponse>,
  ): Promise<TokenMetadataResponse>;
}

export interface TokenAllowanceParams {
  contract: string;
  owner: string;
  spender: string;
}

export type TokenAllowanceResponse = string;

export interface TokenBalancesResponse {
  address: string;
  tokenBalances: TokenBalance[];
}

export type TokenBalance = TokenBalanceSuccess | TokenBalanceFailure;

export interface TokenBalanceSuccess {
  address: string;
  tokenBalance: string;
  error: null;
}

export interface TokenBalanceFailure {
  address: string;
  tokenBalance: null;
  error: string;
}

export interface TokenMetadataResponse {
  decimals: number | null;
  logo: string | null;
  name: string | null;
  symbol: string | null;
}

/**
 * Same as Eth, but with `subscribe` allowing more types.
 */
export interface AlchemyEth extends Eth {
  subscribe(
    type: "logs",
    options?: LogsOptions,
    callback?: (error: Error, log: Log) => void,
  ): Subscription<Log>;
  subscribe(
    type: "syncing",
    options?: null,
    callback?: (error: Error, result: Syncing) => void,
  ): Subscription<Syncing>;
  subscribe(
    type: "newBlockHeaders",
    options?: null,
    callback?: (error: Error, blockHeader: BlockHeader) => void,
  ): Subscription<BlockHeader>;
  subscribe(
    type: "pendingTransactions",
    options?: null,
    callback?: (error: Error, transactionHash: string) => void,
  ): Subscription<string>;
  subscribe(
    type: "alchemy_fullPendingTransactions",
    options?: null,
    callback?: (error: Error, transaction: Transaction) => void,
  ): Subscription<Transaction>;
  subscribe(
    type:
      | "pendingTransactions"
      | "logs"
      | "syncing"
      | "newBlockHeaders"
      | "alchemy_fullPendingTransactions",
    options?: null | LogsOptions,
    callback?: (
      error: Error,
      item: Log | Syncing | BlockHeader | string | Transaction,
    ) => void,
  ): Subscription<Log | BlockHeader | Syncing | string>;
}

interface EthereumWindow extends Window {
  ethereum?: any;
}

declare const window: EthereumWindow;

export function createAlchemyWeb3(
  alchemyUrl: string,
  config?: AlchemyWeb3Config,
): AlchemyWeb3 {
  const fullConfig = fillInConfigDefaults(config);
  const { provider, setWriteProvider } = makeAlchemyContext(
    alchemyUrl,
    fullConfig,
  );
  const alchemyWeb3 = new Web3(provider) as AlchemyWeb3;
  alchemyWeb3.setProvider = () => {
    throw new Error(
      "setProvider is not supported in Alchemy Web3. To change the provider used for writes, use setWriteProvider() instead.",
    );
  };
  alchemyWeb3.setWriteProvider = setWriteProvider;
  const send = alchemyWeb3.currentProvider.send.bind(
    alchemyWeb3.currentProvider,
  );
  alchemyWeb3.alchemy = {
    getTokenAllowance: (params: TokenAllowanceParams, callback) =>
      callAlchemyMethod({
        send,
        callback,
        method: "alchemy_getTokenAllowance",
        params: [params],
      }),
    getTokenBalances: (address, contractAddresses, callback) =>
      callAlchemyMethod({
        send,
        callback,
        method: "alchemy_getTokenBalances",
        params: [address, contractAddresses],
        processResponse: processTokenBalanceResponse,
      }),
    getTokenMetadata: (address, callback) =>
      callAlchemyMethod({
        send,
        callback,
        params: [address],
        method: "alchemy_getTokenMetadata",
      }),
  };
  patchSubscriptions(alchemyWeb3);
  return alchemyWeb3;
}

function fillInConfigDefaults({
  writeProvider = getWindowProvider(),
  maxRetries = DEFAULT_MAX_RETRIES,
  retryInterval = DEFAULT_RETRY_INTERVAL,
  retryJitter = DEFAULT_RETRY_JITTER,
}: AlchemyWeb3Config = {}): FullConfig {
  return { writeProvider, maxRetries, retryInterval, retryJitter };
}

function getWindowProvider(): Provider | null {
  return typeof window !== "undefined" ? window.ethereum : null;
}

interface CallAlchemyMethodParams<T> {
  method: string;
  params: any[];
  callback?: Web3Callback<T>;
  send(method: string, params?: any[]): any;
  processResponse?(response: any): T;
}

function callAlchemyMethod<T>({
  method,
  params,
  send,
  callback = noop,
  processResponse = identity,
}: CallAlchemyMethodParams<T>): Promise<T> {
  const promise = (async () => {
    const result = await send(method, params);
    return processResponse(result);
  })();
  callWhenDone(promise, callback);
  return promise;
}

function processTokenBalanceResponse(
  rawResponse: TokenBalancesResponse,
): TokenBalancesResponse {
  // Convert token balance fields from hex-string to decimal-string.
  const fixedTokenBalances = rawResponse.tokenBalances.map(balance =>
    balance.tokenBalance != null
      ? { ...balance, tokenBalance: hexToNumberString(balance.tokenBalance) }
      : balance,
  );
  return { ...rawResponse, tokenBalances: fixedTokenBalances };
}

/**
 * Updates Web3's internal subscription architecture to also handle Alchemy
 * specific subscriptions.
 */
function patchSubscriptions(web3: Web3): void {
  const { subscriptionsFactory } = web3.eth as any;
  const oldGetSubscription = subscriptionsFactory.getSubscription.bind(
    subscriptionsFactory,
  );
  subscriptionsFactory.getSubscription = (...args: any[]) => {
    const [moduleInstance, type] = args;
    if (type === "alchemy_fullPendingTransactions") {
      return new FullTransactionsSubscription(
        subscriptionsFactory.utils,
        subscriptionsFactory.formatters,
        moduleInstance,
      );
    } else {
      return oldGetSubscription(...args);
    }
  };
}

function noop(): void {
  // Nothing.
}

function identity<T>(x: T): T {
  return x;
}
