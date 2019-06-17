import { JsonRpcRequest, JsonRpcResponse } from "../types";
import { makeHttpSender } from "./alchemySendHttp";
import { makeWebSocketSender } from "./alchemySendWebSocket";

export type AlchemySendFunction = (
  request: JsonRpcRequest,
) => Promise<AlchemySendResult>;

export type AlchemySendResult =
  | JsonRpcSendResult
  | RateLimitSendResult
  | NetworkErrorSendResult;

export interface JsonRpcSendResult {
  type: "jsonrpc";
  response: JsonRpcResponse;
}

export interface RateLimitSendResult {
  type: "rateLimit";
}

export interface NetworkErrorSendResult {
  type: "networkError";
  status: number;
  message: string;
}

export function makeAlchemySender(url: string): AlchemySendFunction {
  if (/^https?:\/\//.test(url)) {
    return makeHttpSender(url);
  } else if (/^wss?:\/\//.test(url)) {
    return makeWebSocketSender(url);
  } else {
    throw new Error(
      `Alchemy URL protocol must be one of http, https, ws, or wss. Recieved: ${url}`,
    );
  }
}
