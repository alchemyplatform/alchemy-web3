import assertNever from "assert-never";
import {
  Eip1193Provider,
  FullConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  Provider,
  SingleOrBatchRequest,
  SingleOrBatchResponse,
} from "../types";
import { delay, promisify } from "../util/promises";
import { AlchemySendFunction } from "./alchemySend";

const ALCHEMY_DISALLOWED_METHODS: string[] = [
  "eth_accounts",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData",
  "personal_sign",
];

export interface PayloadSender {
  sendPayload: SendPayloadFunction;
  setWriteProvider(writeProvider: Provider | null | undefined): void;
}

export interface SendPayloadFunction {
  (payload: JsonRpcRequest): Promise<JsonRpcResponse>;
  (payload: SingleOrBatchRequest): Promise<SingleOrBatchResponse>;
}

export function makePayloadSender(
  alchemySend: AlchemySendFunction,
  config: FullConfig,
): PayloadSender {
  let currentWriteProvider = getEip1193Provider(config.writeProvider);

  const sendPayload = (
    payload: SingleOrBatchRequest,
  ): Promise<SingleOrBatchResponse> => {
    const disallowedMethod = getDisallowedMethod(payload);
    if (!disallowedMethod) {
      try {
        return sendWithRetries(payload, alchemySend, config);
      } catch (alchemyError) {
        // Fallback to write provider, but if both fail throw the error from
        // Alchemy.
        if (!currentWriteProvider) {
          throw alchemyError;
        }
        try {
          return sendWithProvider(currentWriteProvider, payload);
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
      return sendWithProvider(currentWriteProvider, payload);
    }
  };

  function setWriteProvider(writeProvider: Provider | null | undefined) {
    currentWriteProvider = getEip1193Provider(writeProvider);
  }

  return { sendPayload: sendPayload as SendPayloadFunction, setWriteProvider };
}

function getEip1193Provider(
  provider: Provider | null | undefined,
): Eip1193Provider | undefined {
  if (!provider) {
    return undefined;
  }
  const anyProvider: any = provider;
  let nextId = 0;
  const sendMethod = (anyProvider.sendAsync
    ? anyProvider.sendAsync
    : anyProvider.send
  ).bind(anyProvider);
  return {
    send: (method, params) =>
      promisify(callback =>
        sendMethod(
          { jsonrpc: "2.0", id: `legacy:${nextId++}`, method, params },
          callback,
        ),
      ),
  };
}

function sendWithProvider(
  provider: Eip1193Provider,
  payload: SingleOrBatchRequest,
): Promise<SingleOrBatchResponse> {
  if (!Array.isArray(payload)) {
    const { method, params } = payload;
    return provider.send(method, params);
  } else {
    // These providers don't support batches, sadly.
    return Promise.all(
      payload.map(({ method, params }) => provider.send(method, params)),
    );
  }
}

function getDisallowedMethod(
  payload: SingleOrBatchRequest,
): string | undefined {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const disallowedRequest =
    payloads.find(p => ALCHEMY_DISALLOWED_METHODS.indexOf(p.method) >= 0) ||
    undefined;
  return disallowedRequest && disallowedRequest.method;
}

async function sendWithRetries(
  payload: SingleOrBatchRequest,
  alchemySend: AlchemySendFunction,
  { maxRetries, retryInterval, retryJitter }: FullConfig,
): Promise<SingleOrBatchResponse> {
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
