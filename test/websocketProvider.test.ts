import SturdyWebSocket from "sturdy-websocket";
import { JsonRpcResponse } from "../src/types";
import {
  JsonRpcSenders,
  makeJsonRpcPayloadFactory,
  makeJsonRpcSenders,
} from "../src/util/jsonRpc";
import { promisify } from "../src/util/promises";
import { AlchemyWebSocketProvider } from "../src/web3-adapter/webSocketProvider";
import { Mocked } from "./testUtils";

let ws: Mocked<SturdyWebSocket>;
let sendJsonRpcPayload: jest.Mock;
let jsonRpcSenders: JsonRpcSenders;
let wsProvider: AlchemyWebSocketProvider;

beforeEach(() => {
  ws = {
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as any;
  sendJsonRpcPayload = jest.fn();
  jsonRpcSenders = makeJsonRpcSenders(
    sendJsonRpcPayload,
    makeJsonRpcPayloadFactory(),
  );
  wsProvider = new AlchemyWebSocketProvider(
    ws as any,
    sendJsonRpcPayload,
    jsonRpcSenders,
  );
});

afterEach(() => {
  wsProvider.disconnect();
});

describe("AlchemyWebSocketProvider", () => {
  it("sends and receives payloads", async () => {
    let resolve: (result: JsonRpcResponse) => void = undefined!;
    const promise = new Promise<JsonRpcResponse>((r) => (resolve = r));
    sendJsonRpcPayload.mockReturnValue(promise);
    const result = promisify((callback) =>
      wsProvider.send(
        {
          jsonrpc: "2.0",
          id: 10,
          method: "eth_getBlockByNumber",
          params: ["latest", false],
        },
        callback,
      ),
    );
    expect(sendJsonRpcPayload).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      id: 10,
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    });
    const { id } = sendJsonRpcPayload.mock.calls[0][0];
    const expected: JsonRpcResponse = {
      id,
      jsonrpc: "2.0",
      result: "Some block",
    };
    resolve(expected);
    expect(await result).toEqual(expected);
  });
});
