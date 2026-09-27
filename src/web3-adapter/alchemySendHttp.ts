import fetchPonyfill from "fetch-ponyfill";
import { VERSION } from "../version";
import { AlchemySendJsonRpcFunction } from "./alchemySend";

const { fetch, Headers } = fetchPonyfill();

const ALCHEMY_HEADERS = new Headers({
  Accept: "application/json",
  "Content-Type": "application/json",
  "Alchemy-Web3-Version": VERSION,
});
const RATE_LIMIT_STATUS = 429;

// Requests without a bound can hang indefinitely when the upstream stalls
// (TCP accepted, no response). Default to 30s so callers surface a network
// error instead of an unresolved promise.
const DEFAULT_REQUEST_TIMEOUT = 30_000;

export function makeJsonRpcHttpSender(url: string): AlchemySendJsonRpcFunction {
  return async (request) => {
    const response = await fetch(url, {
      method: "POST",
      headers: ALCHEMY_HEADERS,
      body: JSON.stringify(request),
      ...(typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? { signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT) }
        : {}),
    });
    const { status } = response;
    switch (status) {
      case 200:
        return { type: "jsonrpc", response: await response.json() };
      case RATE_LIMIT_STATUS:
        return { type: "rateLimit" };
      case 0:
        return {
          type: "networkError",
          status: 0,
          message: "Connection failed.",
        };
      default:
        return {
          status,
          type: "networkError",
          message: (await response.json()).error?.message,
        };
    }
  };
}
