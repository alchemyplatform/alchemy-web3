import SturdyWebSocket from "sturdy-websocket";
import { SingleOrBatchRequest, SingleOrBatchResponse } from "../types";

export interface AlchemySender {
  alchemySend: AlchemySendJsonRpcFunction;
  ws?: SturdyWebSocket;
}

export type AlchemySendJsonRpcFunction = (
  request: SingleOrBatchRequest,
) => Promise<AlchemySendJsonRpcResult>;

export type AlchemySendJsonRpcResult =
  | JsonRpcSendResult
  | RateLimitSendResult
  | NetworkErrorSendResult;

export interface JsonRpcSendResult {
  type: "jsonrpc";
  response: SingleOrBatchResponse;
}

export interface RateLimitSendResult {
  type: "rateLimit";
}

export interface NetworkErrorSendResult {
  type: "networkError";
  status: number;
  message: string;
}
