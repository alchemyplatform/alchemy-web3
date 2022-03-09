import assertNever from "assert-never";
import {
  FullConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  Provider,
  SingleOrBatchRequest,
  SingleOrBatchResponse,
} from "../types";
import { delay, promisify } from "../util/promises";
import { AlchemySendJsonRpcFunction } from "./alchemySend";

const ALCHEMY_DISALLOWED_METHODS: string[] = [
  "eth_accounts",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData",
  "personal_sign",
];

export interface JsonRpcPayloadSender {
  sendJsonRpcPayload: SendJsonRpcPayloadFunction;
  setWriteProvider(writeProvider: Provider | null | undefined): void;
}

export interface SendJsonRpcPayloadFunction {
  (payload: JsonRpcRequest): Promise<JsonRpcResponse>;
  (payload: SingleOrBatchRequest): Promise<SingleOrBatchResponse>;
}

export function makeJsonRpcPayloadSender(
  alchemySendJsonRpc: AlchemySendJsonRpcFunction,
  config: FullConfig,
): JsonRpcPayloadSender {
  let currentWriteProvider = config.writeProvider;

  const sendJsonRpcPayload = (
    payload: SingleOrBatchRequest,
  ): Promise<SingleOrBatchResponse> => {
    const disallowedMethod = getDisallowedMethod(payload);
    if (!disallowedMethod) {
      try {
        return sendJsonRpcWithRetries(payload, alchemySendJsonRpc, config);
      } catch (alchemyError) {
        // Fallback to write provider, but if both fail throw the error from
        // Alchemy.
        if (!currentWriteProvider) {
          throw alchemyError;
        }
        try {
          return sendJsonRpcWithProvider(currentWriteProvider, payload);
        } catch {
          throw alchemyError;
        }
      }
    } else {
      if (!currentWriteProvider) {
        throw new Error(
          `No provider available for method "${disallowedMethod}"`,
        );
      }
      return sendJsonRpcWithProvider(currentWriteProvider, payload);
    }
  };

  function setWriteProvider(writeProvider: Provider | null | undefined) {
    currentWriteProvider = writeProvider ?? null;
  }

  return {
    sendJsonRpcPayload: sendJsonRpcPayload as SendJsonRpcPayloadFunction,
    setWriteProvider,
  };
}

function sendJsonRpcWithProvider(
  provider: Provider,
  payload: SingleOrBatchRequest,
): Promise<SingleOrBatchResponse> {
  const anyProvider: any = provider;
  const sendMethod = (
    anyProvider.sendAsync ? anyProvider.sendAsync : anyProvider.send
  ).bind(anyProvider);
  return promisify((callback) => sendMethod(payload, callback));
}

function getDisallowedMethod(
  payload: SingleOrBatchRequest,
): string | undefined {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const disallowedRequest =
    payloads.find((p) => ALCHEMY_DISALLOWED_METHODS.indexOf(p.method) >= 0) ||
    undefined;
  return disallowedRequest && disallowedRequest.method;
}

async function sendJsonRpcWithRetries(
  payload: SingleOrBatchRequest,
  alchemySendJsonRpc: AlchemySendJsonRpcFunction,
  { maxRetries, retryInterval, retryJitter }: FullConfig,
): Promise<SingleOrBatchResponse> {
  for (let i = 0; i < maxRetries + 1; i++) {
    const result = await alchemySendJsonRpc(payload);
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
