import assertNever from "assert-never";
import Web3 from "web3";
import { AlchemySendFunction, makeAlchemySender } from "./network/alchemySend";
import { JsonRpcRequest, JsonRpcResponse } from "./types";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL = 1000;
const DEFAULT_RETRY_JITTER = 250;

export interface AlchemyWeb3Config {
  writeProvider?: Provider | null;
  maxRetries?: number;
  retryInterval?: number;
  retryJitter?: number;
}

type FullConfig = Required<AlchemyWeb3Config>;

export type Provider = Eip1193Provider | LegacyProvider;

export interface Eip1193Provider {
  send(method: string, params?: any[]): Promise<any>;
}

export interface LegacyProvider {
  sendAsync(payload: any, callback: (error: any, result: any) => void): void;
}

function getEip1193Provider(
  provider: Provider | null | undefined,
): Eip1193Provider | undefined {
  if (!provider) {
    return undefined;
  } else if ((provider as Eip1193Provider).send) {
    return provider as Eip1193Provider;
  } else {
    let nextId = 0;
    return {
      send: (method, params) =>
        promisify(callback =>
          (provider as LegacyProvider).sendAsync(
            { jsonrpc: "2.0", id: `legacy:${nextId++}`, method, params },
            callback,
          ),
        ),
    };
  }
}

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

export function createAlchemyWeb3(
  alchemyUrl: string,
  config?: AlchemyWeb3Config,
): AlchemyWeb3 {
  const fullConfig = fillInConfigDefaults(config);
  const alchemySend = makeAlchemySender(alchemyUrl);
  let currentWriteProvider = getEip1193Provider(fullConfig.writeProvider);

  function sendAsync(
    payload: JsonRpcRequest,
    callback: Web3Callback<JsonRpcResponse>,
  ): void {
    callWhenDone(
      send(payload, alchemySend, currentWriteProvider, fullConfig),
      callback,
    );
  }

  const alchemyWeb3 = new Web3({ sendAsync } as any) as AlchemyWeb3;
  alchemyWeb3.setProvider = () => {
    throw new Error(
      "setProvider is not supported in Alchemy Web3. To change the provider used for writes, use setWriteProvider() instead.",
    );
  };
  alchemyWeb3.setWriteProvider = provider =>
    (currentWriteProvider = getEip1193Provider(provider));
  alchemyWeb3.alchemy = {
    getTokenAllowance: (params: TokenAllowanceParams, callback) =>
      callAlchemyMethod({
        alchemySend,
        callback,
        params: [params],
        method: "alchemy_getTokenAllowance",
        config: fullConfig,
      }),
    getTokenBalances: (address, contractAddresses, callback) =>
      callAlchemyMethod({
        alchemySend,
        callback,
        method: "alchemy_getTokenBalances",
        params: [address, contractAddresses],
        processResponse: processTokenBalanceResponse,
        config: fullConfig,
      }),
    getTokenMetadata: (address, callback) =>
      callAlchemyMethod({
        alchemySend,
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

async function send(
  payload: JsonRpcRequest,
  alchemySend: AlchemySendFunction,
  writeProvider: Eip1193Provider | undefined,
  config: FullConfig,
): Promise<JsonRpcResponse> {
  if (ALCHEMY_DISALLOWED_METHODS.indexOf(payload.method) === -1) {
    try {
      return sendWithRetries(payload, alchemySend, config);
    } catch (alchemyError) {
      // Fallback to write provider, but if both fail throw the error from
      // Alchemy.
      if (!writeProvider) {
        throw alchemyError;
      }
      try {
        return sendWithProvider(writeProvider, payload);
      } catch {
        throw alchemyError;
      }
    }
  } else {
    if (!writeProvider) {
      throw new Error(`No provider available for method "${payload.method}"`);
    }
    return sendWithProvider(writeProvider, payload);
  }
}

async function sendWithRetries(
  payload: JsonRpcRequest,
  alchemySend: AlchemySendFunction,
  { maxRetries, retryInterval, retryJitter }: FullConfig,
): Promise<JsonRpcResponse> {
  for (let i = 0; i < maxRetries + 1; i++) {
    const result = await alchemySend(payload);
    switch (result.type) {
      case "jsonrpc":
        return result.response;
      case "rateLimit":
        break;
      case "networkError": {
        const { status, message } = result;
        const statusString = status !== 0 ? `(${status}) ` : "";
        throw new Error(`${statusString} ${message}`);
      }
      default:
        return assertNever(result);
    }
    await delay(retryInterval + ((retryJitter * Math.random()) | 0));
  }
  throw new Error(`Rate limited for ${maxRetries + 1} consecutive attempts.`);
}

function sendWithProvider(
  provider: Eip1193Provider,
  payload: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const { method, params } = payload;
  return provider.send(method, params);
}

function getWindowProvider(): Provider | null {
  return typeof window !== "undefined" ? window.ethereum : null;
}

interface CallAlchemyMethodParams<T> {
  method: string;
  params: any[];
  alchemySend: AlchemySendFunction;
  config: FullConfig;
  callback?: Web3Callback<T>;
  processResponse?(response: any): T;
}

function callAlchemyMethod<T>({
  method,
  params,
  alchemySend,
  config,
  callback = noop,
  processResponse = identity,
}: CallAlchemyMethodParams<T>): Promise<T> {
  const promise = (async () => {
    const payload: JsonRpcRequest = { method, params, jsonrpc: "2.0", id: 0 };
    const { error, result } = await sendWithRetries(
      payload,
      alchemySend,
      config,
    );
    if (error != null) {
      throw new Error(error.message);
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
