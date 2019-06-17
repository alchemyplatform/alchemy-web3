import SturdyWebSocket from "sturdy-websocket";
import { JsonRpcId, JsonRpcResponse } from "../types";
import { AlchemySendFunction, AlchemySendResult } from "./alchemySend";

export function makeWebSocketSender(url: string): AlchemySendFunction {
  let resolveFunctionsById: Map<
    JsonRpcId,
    (response: AlchemySendResult) => void
  > = new Map();
  const ws = new SturdyWebSocket(url);
  ws.addEventListener("message", message => {
    const response: JsonRpcResponse = JSON.parse(message.data);
    const { id } = response;
    const resolve = resolveFunctionsById.get(id);
    if (resolve) {
      resolveFunctionsById.delete(id);
      // Cast to any needed because Web3's type for the error field is incorrect
      // according to the JSON-RPC spec. The error field should be an object,
      // not a string.
      if (response.error && (response.error as any).code === 429) {
        resolve({ type: "rateLimit" });
      } else {
        resolve({ response, type: "jsonrpc" });
      }
    }
  });
  ws.addEventListener("down", () => {
    const oldResolveFunctionsById = resolveFunctionsById;
    resolveFunctionsById = new Map();
    for (const [id, resolve] of oldResolveFunctionsById.entries()) {
      resolve({
        type: "networkError",
        status: 0,
        message: `WebSocket closed before receiving a response for request with id: ${id}`,
      });
    }
  });

  return request =>
    new Promise(resolve => {
      const { id } = request;
      if (id !== undefined) {
        const existingResolve = resolveFunctionsById.get(id);
        if (existingResolve) {
          const message = `Another WebSocket request was made with the same id (${id}) before a response was received.`;
          console.error(message);
          existingResolve({
            message,
            type: "networkError",
            status: 0,
          });
        }
        resolveFunctionsById.set(id, resolve);
      }
      ws.send(JSON.stringify(request));
    });
}
