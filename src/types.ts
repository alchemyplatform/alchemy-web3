// The JSON-RPC types in Web3 definitions aren't quite right. Use these instead.

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any[];
  id?: JsonRpcId;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: JsonRpcError;
  id: JsonRpcId;
}

export type SingleOrBatchRequest = JsonRpcRequest | JsonRpcRequest[];
export type SingleOrBatchResponse = JsonRpcResponse | JsonRpcResponse[];

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface SubscriptionEvent {
  jsonrpc: "2.0";
  method: "eth_subscription";
  params: {
    subscription: string;
    result: any;
  };
}

export type WebSocketMessage = SingleOrBatchResponse | SubscriptionEvent;

export function isResponse(
  message: WebSocketMessage,
): message is SingleOrBatchResponse {
  return (
    Array.isArray(message) ||
    (message.jsonrpc === "2.0" && (message as JsonRpcResponse).id !== undefined)
  );
}

export function isSubscriptionEvent(
  message: WebSocketMessage,
): message is SubscriptionEvent {
  return !isResponse(message);
}

export interface AlchemyWeb3Config {
  writeProvider?: Provider | null;
  maxRetries?: number;
  retryInterval?: number;
  retryJitter?: number;
}

export type FullConfig = Required<AlchemyWeb3Config>;

export type Provider = Eip1193Provider | LegacyProvider;

export interface Eip1193Provider {
  send(method: string, params?: any[]): Promise<any>;
}

export interface LegacyProvider {
  sendAsync(payload: any, callback: (error: any, result: any) => void): void;
}

export type Web3Callback<T> = (error: Error | null, result?: T) => void;
