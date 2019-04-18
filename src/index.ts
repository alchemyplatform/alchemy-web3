import fetchPonyfill from "fetch-ponyfill";
import Web3 from "web3";
import { JsonRpcPayload } from "web3-providers";
import { JsonRPCRequest, JsonRPCResponse } from "web3/providers";

const { fetch, Headers } = fetchPonyfill();

export interface AlchemyWeb3 extends Web3 {
  alchemy: AlchemyMethods;
}

export interface AlchemyMethods {
  getTokenBalances(
    tokenBalanceAddress: string,
    contractAddresses: string[],
    callback?: (error: Error | null, result?: TokenBalancesResponse) => void,
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

export function createAlchemyWeb3(alchemyUrl: string): AlchemyWeb3 {
  function sendAsync(
    payload: JsonRpcPayload,
    callback: (error: Error | null, result?: JsonRPCResponse) => void,
  ): void {
    sendAsyncForPromise(payload, alchemyUrl).then(
      result => callback(null, result),
      error => callback(error),
    );
  }
  const alchemyWeb3 = new Web3({ sendAsync } as any) as AlchemyWeb3;
  alchemyWeb3.alchemy = {
    getTokenBalances: async (
      tokenBalanceAddress,
      contractAddresses,
      callback,
    ) => {
      const payload: JsonRPCRequest = {
        jsonrpc: "2.0",
        id: 0,
        method: "alchemy_getTokenBalances",
        params: [tokenBalanceAddress, contractAddresses],
      };
      try {
        const { error, result } = await sendAsyncForPromise(
          payload,
          alchemyUrl,
        );
        if (error != null) {
          const errorObject = new Error(error);
          if (callback) {
            callback(errorObject);
          }
          throw error;
        }
        if (callback) {
          callback(null, result);
        }
        return result;
      } catch (error) {
        if (callback) {
          callback(error);
        }
        throw error;
      }
    },
  };
  return alchemyWeb3;
}

async function sendAsyncForPromise(
  payload: JsonRpcPayload,
  alchemyUrl: string,
): Promise<JsonRPCResponse> {
  if (ALCHEMY_DISALLOWED_METHODS.indexOf(payload.method) === -1) {
    try {
      return await sendToAlchemy(payload, alchemyUrl);
    } catch {
      // Fallthrough to environment provider.
    }
  }
  return sendToEnvironmentProvider(payload);
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

function sendToEnvironmentProvider(
  payload: JsonRpcPayload,
): Promise<JsonRPCResponse> {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) {
    return Promise.reject(
      `No Ethereum provider found for method "${payload.method}"`,
    );
  }
  return new Promise((resolve, reject) =>
    provider.sendAsync(
      payload,
      (error: Error | null, result?: JsonRPCResponse) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    ),
  );
}
