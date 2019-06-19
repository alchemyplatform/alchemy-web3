import { JsonRpcRequest } from "../types";

export function makePayloadFactory(): (
  method: string,
  params: any[],
) => JsonRpcRequest {
  let nextId = 0;
  return (method, params) => ({ method, params, jsonrpc: "2.0", id: nextId++ });
}
