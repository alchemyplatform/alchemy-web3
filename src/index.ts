import fetchPonyfill from "fetch-ponyfill";
import Web3 from "web3";
import { JsonRpcPayload } from "web3-providers";
import { JsonRPCRequest, JsonRPCResponse } from "web3/providers";

const { fetch, Headers } = fetchPonyfill();

export interface AlchemyWeb3Config {
  writeProvider?: Provider;
}

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
  getTokenBalances(
    address: string,
    contractAddresses: string[],
    callback?: Web3Callback<TokenBalancesResponse>,
  ): Promise<TokenBalancesResponse>;
}

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
});

export function createAlchemyWeb3(
  alchemyUrl: string,
  { writeProvider = getWindowProvider() }: AlchemyWeb3Config = {},
): AlchemyWeb3 {
  let currentProvider = writeProvider;
  function sendAsync(
    payload: JsonRpcPayload,
    callback: Web3Callback<JsonRPCResponse>,
  ): void {
    callWhenDone(promisedSend(payload, alchemyUrl, currentProvider), callback);
  }
  const alchemyWeb3 = new Web3({ sendAsync } as any) as AlchemyWeb3;
  alchemyWeb3.setProvider = () => {
    throw new Error(
      "setProvider is not supported in Alchemy Web3. To change the provider used for writes, use setWriteProvider() instead.",
    );
  };
  alchemyWeb3.setWriteProvider = provider => (currentProvider = provider);
  alchemyWeb3.alchemy = {
    getTokenBalances: (address, contractAddresses, callback) =>
      callAlchemyMethod({
        alchemyUrl,
        callback,
        method: "alchemy_getTokenBalances",
        params: [address, contractAddresses],
        processResponse: processTokenBalanceResponse,
      }),
  };
  return alchemyWeb3;
}

async function promisedSend(
  payload: JsonRpcPayload,
  alchemyUrl: string,
  writeProvider: Provider | undefined,
): Promise<JsonRPCResponse> {
  if (ALCHEMY_DISALLOWED_METHODS.indexOf(payload.method) === -1) {
    try {
      return await sendToAlchemy(payload, alchemyUrl);
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

async function sendToAlchemy(
  payload: JsonRpcPayload,
  alchemyUrl: string,
): Promise<JsonRPCResponse> {
  const response = await fetch(alchemyUrl, {
    method: "POST",
    headers: ALCHEMY_HEADERS,
    body: JSON.stringify(payload),
  });
  return response.json();
}

function sendToProvider(
  payload: JsonRpcPayload,
  provider: Provider,
): Promise<JsonRPCResponse> {
  const anyProvider: any = provider;
  if (anyProvider.sendAsync) {
    return promiseFromCallback(callback =>
      anyProvider.sendAsync(payload, callback),
    );
  } else {
    return promiseFromCallback(callback => anyProvider.send(payload, callback));
  }
}

function getWindowProvider(): Provider | undefined {
  return typeof window !== "undefined" ? window.ethereum : undefined;
}

interface CallAlchemyMethodParams<T> {
  method: string;
  params: any[];
  alchemyUrl: string;
  callback?: Web3Callback<T>;
  processResponse?(response: any): T;
}

function callAlchemyMethod<T>({
  method,
  params,
  alchemyUrl,
  callback = noop,
  processResponse = identity,
}: CallAlchemyMethodParams<T>): Promise<T> {
  const promise = (async () => {
    const payload: JsonRPCRequest = { method, params, jsonrpc: "2.0", id: 0 };
    const { error, result } = await sendToAlchemy(payload, alchemyUrl);
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
function promiseFromCallback<T>(
  f: (callback: Web3Callback<T>) => void,
): Promise<T> {
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
