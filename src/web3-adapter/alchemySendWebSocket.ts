import SturdyWebSocket from "sturdy-websocket";
import {
  isResponse,
  JsonRpcId,
  SingleOrBatchRequest,
  SingleOrBatchResponse,
  WebSocketMessage,
} from "../types";
import { AlchemySendFunction, AlchemySendResult } from "./alchemySend";

export function makeWebSocketSender(ws: SturdyWebSocket): AlchemySendFunction {
  let resolveFunctionsById: Map<
    JsonRpcId,
    (response: AlchemySendResult) => void
  > = new Map();
  ws.addEventListener("message", message => {
    const response: WebSocketMessage = JSON.parse(message.data);
    if (!isResponse(response)) {
      return;
    }
    const id = getIdFromResponse(response);
    if (id === undefined) {
      return;
    }
    const resolve = resolveFunctionsById.get(id);
    if (resolve) {
      resolveFunctionsById.delete(id);
      if (
        !Array.isArray(response) &&
        response.error &&
        response.error.code === 429
      ) {
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
      const id = getIdFromRequest(request);
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

function getIdFromRequest(
  request: SingleOrBatchRequest,
): JsonRpcId | undefined {
  if (!Array.isArray(request)) {
    return request.id;
  }
  // In a batch, find the first payload with defined id.
  const payload = request.find(p => p.id !== undefined) || undefined;
  return payload && payload.id;
}

function getIdFromResponse(
  response: SingleOrBatchResponse,
): JsonRpcId | undefined {
  if (!Array.isArray(response)) {
    return response.id;
  }
  // In a batch, find the first payload with defined id.
  const payload = response.find(p => p.id !== undefined) || undefined;
  return payload && payload.id;
}
