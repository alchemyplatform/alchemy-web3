import SturdyWebSocket from "sturdy-websocket";
import { w3cwebsocket } from "websocket";
import { FullConfig, Provider } from "../types";
import {
  JsonRpcSenders,
  makeJsonRpcPayloadFactory,
  makeJsonRpcSenders,
} from "../util/jsonRpc";
import { VERSION } from "../version";
import { makeJsonRpcHttpSender } from "./alchemySendHttp";
import { makeWebSocketSender } from "./alchemySendWebSocket";
import { makeAlchemyHttpProvider } from "./httpProvider";
import { makeJsonRpcPayloadSender } from "./sendJsonRpcPayload";
import { makeRestPayloadSender, RestPayloadSender } from "./sendRestPayload";
import { AlchemyWebSocketProvider } from "./webSocketProvider";

const NODE_MAX_WS_FRAME_SIZE = 100 * 1024 * 1024; // 100 MB

export interface AlchemyContext {
  provider: any;
  restSender: RestPayloadSender;
  jsonRpcSenders: JsonRpcSenders;
  setWriteProvider(provider: Provider | null | undefined): void;
}

export function makeAlchemyContext(
  url: string,
  config: FullConfig,
): AlchemyContext {
  const makeJsonRpcPayload = makeJsonRpcPayloadFactory();
  const restSender = makeRestPayloadSender({
    config,
    url,
  });
  if (/^https?:\/\//.test(url)) {
    const alchemySendJsonrRpc = makeJsonRpcHttpSender(url);
    const { sendJsonRpcPayload, setWriteProvider } = makeJsonRpcPayloadSender(
      alchemySendJsonrRpc,
      config,
    );
    const jsonRpcSenders = makeJsonRpcSenders(
      sendJsonRpcPayload,
      makeJsonRpcPayload,
    );
    const provider = makeAlchemyHttpProvider(sendJsonRpcPayload);
    return { provider, jsonRpcSenders, restSender, setWriteProvider };
  } else if (/^wss?:\/\//.test(url)) {
    const protocol = isAlchemyUrl(url) ? `alchemy-web3-${VERSION}` : undefined;
    const ws = new SturdyWebSocket(url, protocol, {
      wsConstructor: getWebSocketConstructor(),
    });
    const alchemySend = makeWebSocketSender(ws);
    const { sendJsonRpcPayload, setWriteProvider } = makeJsonRpcPayloadSender(
      alchemySend,
      config,
    );
    const jsonRpcSenders = makeJsonRpcSenders(
      sendJsonRpcPayload,
      makeJsonRpcPayload,
    );
    const provider = new AlchemyWebSocketProvider(
      ws,
      sendJsonRpcPayload,
      jsonRpcSenders,
    );
    return { provider, jsonRpcSenders, restSender, setWriteProvider };
  } else {
    throw new Error(
      `Alchemy URL protocol must be one of http, https, ws, or wss. Recieved: ${url}`,
    );
  }
}

function getWebSocketConstructor(): any {
  return isNodeEnvironment()
    ? (url: string, protocols?: string | string[] | undefined) =>
        new w3cwebsocket(url, protocols, undefined, undefined, undefined, {
          maxReceivedMessageSize: NODE_MAX_WS_FRAME_SIZE,
          maxReceivedFrameSize: NODE_MAX_WS_FRAME_SIZE,
        })
    : WebSocket;
}

function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    process != null &&
    process.versions != null &&
    process.versions.node != null
  );
}

function isAlchemyUrl(url: string): boolean {
  return url.indexOf("alchemyapi.io") >= 0;
}
