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
  return getCanonicalIdFromList(request.map(p => p.id));
}

function getIdFromResponse(
  response: SingleOrBatchResponse,
): JsonRpcId | undefined {
  if (!Array.isArray(response)) {
    return response.id;
  }
  return getCanonicalIdFromList(response.map(p => p.id));
}

/**
 * Since the JSON-RPC spec allows responses to be returned in a different order
 * than sent, we need a mechanism for choosing a canonical id from a list that
 * doesn't depend on the order. This chooses the "minimum" id by an arbitrary
 * ordering: the smallest string if possible, otherwise the smallest number,
 * otherwise null.
 */
function getCanonicalIdFromList(
  ids: Array<JsonRpcId | undefined>,
): JsonRpcId | undefined {
  const stringIds: string[] = ids.filter(id => typeof id === "string") as any;
  if (stringIds.length > 0) {
    return stringIds.reduce((bestId, id) => (bestId < id ? bestId : id));
  }
  const numberIds: number[] = ids.filter(id => typeof id === "number") as any;
  if (numberIds.length > 0) {
    return Math.min(...numberIds);
  }
  return ids.indexOf(null) >= 0 ? null : undefined;
}
