import fetchPonyfill from "fetch-ponyfill";
import Web3 from "web3";
import { JsonRpcPayload } from "web3-providers";
import { JsonRPCRequest, JsonRPCResponse } from "web3/providers";
import { VERSION } from "./version";

const { fetch, Headers } = fetchPonyfill();

const RATE_LIMIT_STATUS = 429;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL = 1000;
const DEFAULT_RETRY_JITTER = 250;

export interface AlchemyWeb3Config {
  writeProvider?: Provider | null;
  maxRetries?: number;
  retryInterval?: number;
  retryJitter?: number;
}

type FullConfig = { [K in keyof AlchemyWeb3Config]-?: AlchemyWeb3Config[K] };

export type Provider =
  | {
      sendAsync: SendFunction;
    }
  | {
      send: SendFunction;
    };

export type SendFunction = (payload: any, callback: any) => void;

export interface AlchemyWeb3 extends Web3 {
  alchemy: AlchemyMethods;
  setWriteProvider(provider: Provider): void;
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

export type Web3Callback<T> = (error: Error | null, result?: T) => void;

interface EthereumWindow extends Window {
  ethereum?: any;
}

declare const window: EthereumWindow;

const ALCHEMY_DISALLOWED_METHODS: string[] = [
  "eth_accounts",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData",
  "personal_sign",
];

const ALCHEMY_HEADERS = new Headers({
  Accept: "application/json",
  "Content-Type": "application/json",
  "Alchemy-Web3-Version": VERSION,
});

export function createAlchemyWeb3(
  alchemyUrl: string,
  config?: AlchemyWeb3Config,
): AlchemyWeb3 {
  const fullConfig = fillInConfigDefaults(config);
  let currentProvider = fullConfig.writeProvider;
  function sendAsync(
    payload: JsonRpcPayload,
    callback: Web3Callback<JsonRPCResponse>,
  ): void {
    callWhenDone(
      promisedSend(payload, alchemyUrl, currentProvider, fullConfig),
      callback,
    );
  }
  const alchemyWeb3 = new Web3({ sendAsync } as any) as AlchemyWeb3;
  alchemyWeb3.setProvider = () => {
    throw new Error(
      "setProvider is not supported in Alchemy Web3. To change the provider used for writes, use setWriteProvider() instead.",
    );
  };
  alchemyWeb3.setWriteProvider = provider => (currentProvider = provider);
  alchemyWeb3.alchemy = {
    getTokenAllowance: (params: TokenAllowanceParams, callback) =>
      callAlchemyMethod({
        alchemyUrl,
        callback,
        params: [params],
        method: "alchemy_getTokenAllowance",
        config: fullConfig,
      }),
    getTokenBalances: (address, contractAddresses, callback) =>
      callAlchemyMethod({
        alchemyUrl,
        callback,
        method: "alchemy_getTokenBalances",
        params: [address, contractAddresses],
        processResponse: processTokenBalanceResponse,
        config: fullConfig,
      }),
    getTokenMetadata: (address, callback) =>
      callAlchemyMethod({
        alchemyUrl,
        callback,
        params: [address],
        method: "alchemy_getTokenMetadata",
        config: fullConfig,
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

async function promisedSend(
  payload: JsonRpcPayload,
  alchemyUrl: string,
  writeProvider: Provider | null,
  config: FullConfig,
): Promise<JsonRPCResponse> {
  if (ALCHEMY_DISALLOWED_METHODS.indexOf(payload.method) === -1) {
    try {
      return await sendToAlchemyWithRetries(payload, alchemyUrl, config);
    } catch (alchemyError) {
      // Fallback to write provider, but if both fail throw the error from
      // Alchemy.
      if (!writeProvider) {
        throw alchemyError;
      }
      try {
        return await sendToProvider(payload, writeProvider);
      } catch {
        throw alchemyError;
      }
    }
  } else {
    if (!writeProvider) {
      throw new Error(`No provider available for method "${payload.method}"`);
    }
    return sendToProvider(payload, writeProvider);
  }
}

async function sendToAlchemyWithRetries(
  payload: JsonRpcPayload,
  alchemyUrl: string,
  { maxRetries, retryInterval, retryJitter }: FullConfig,
): Promise<JsonRPCResponse> {
  let lastResponse: Response;
  for (let i = 0; i < maxRetries + 1; i++) {
    lastResponse = await sendToAlchemyOnce(payload, alchemyUrl);
    if (lastResponse.status !== RATE_LIMIT_STATUS) {
      return lastResponse.json();
    }
    await delay(retryInterval + ((retryJitter * Math.random()) | 0));
  }
  return lastResponse!.json();
}

function sendToAlchemyOnce(
  payload: JsonRpcPayload,
  alchemyUrl: string,
): Promise<Response> {
  return fetch(alchemyUrl, {
    method: "POST",
    headers: ALCHEMY_HEADERS,
    body: JSON.stringify(payload),
  });
}

function sendToProvider(
  payload: JsonRpcPayload,
  provider: Provider,
): Promise<JsonRPCResponse> {
  const anyProvider: any = provider;
  if (anyProvider.sendAsync) {
    return promisify(callback => anyProvider.sendAsync(payload, callback));
  } else {
    return promisify(callback => anyProvider.send(payload, callback));
  }
}

function getWindowProvider(): Provider | null {
  return typeof window !== "undefined" ? window.ethereum : null;
}

interface CallAlchemyMethodParams<T> {
  method: string;
  params: any[];
  alchemyUrl: string;
  config: FullConfig;
  callback?: Web3Callback<T>;
  processResponse?(response: any): T;
}

function callAlchemyMethod<T>({
  method,
  params,
  alchemyUrl,
  config,
  callback = noop,
  processResponse = identity,
}: CallAlchemyMethodParams<T>): Promise<T> {
  const promise = (async () => {
    const payload: JsonRPCRequest = { method, params, jsonrpc: "2.0", id: 0 };
    const { error, result } = await sendToAlchemyWithRetries(
      payload,
      alchemyUrl,
      config,
    );
    if (error != null) {
      throw new Error(error);
    }
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
 * Helper for converting functions which take a callback as their final argument
 * to functions which return a promise.
 */
function promisify<T>(f: (callback: Web3Callback<T>) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    f((error, result) => {
      if (error != null) {
        reject(error);
      } else {
        resolve(result);
      }
    }),
  );
}

/**
 * Helper for converting functions which return a promise to functions which
 * take a callback as their final argument.
 */
function callWhenDone<T>(promise: Promise<T>, callback: Web3Callback<T>): void {
  promise.then(result => callback(null, result), error => callback(error));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
