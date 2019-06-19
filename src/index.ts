import Web3 from "web3";
import { AlchemyWeb3Config, FullConfig, Provider, Web3Callback } from "./types";
import { callWhenDone } from "./util/promises";
import { makeAlchemyContext } from "./web3-adapter/alchemyContext";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL = 1000;
const DEFAULT_RETRY_JITTER = 250;

export interface AlchemyWeb3 extends Web3 {
  alchemy: AlchemyMethods;
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
      ? { ...balance, tokenBalance: hexToDecimal(balance.tokenBalance) }
      : balance,
  );
  return { ...rawResponse, tokenBalances: fixedTokenBalances };
}

/**
 * Converts a hex string to a string of a decimal number. Works even with
 * numbers so large that they cannot fit into a double without losing precision.
 */
function hexToDecimal(hex: string): string {
  if (hex.startsWith("0x")) {
    return hexToDecimal(hex.slice(2));
  }
  // https://stackoverflow.com/a/21675915/2695248
  const digits = [0];
  for (let i = 0; i < hex.length; i += 1) {
    let carry = parseInt(hex.charAt(i), 16);
    for (let j = 0; j < digits.length; j += 1) {
      digits[j] = digits[j] * 16 + carry;
      carry = (digits[j] / 10e16) | 0;
      digits[j] %= 10e16;
    }
    while (carry > 0) {
      digits.push(carry % 10e16);
      carry = (carry / 10e16) | 0;
    }
  }
  return digits.reverse().join("");
}

function noop(): void {
  // Nothing.
}

function identity<T>(x: T): T {
  return x;
}
