import SturdyWebSocket from "sturdy-websocket";
import { JsonRpcResponse } from "../src/types";
import { AlchemyWebSocketProvider } from "../src/web3-adapter/webSocketProvider";
import { Mocked } from "./testUtils";

let ws: Mocked<SturdyWebSocket>;
let sendPayload: jest.Mock;
let wsProvider: AlchemyWebSocketProvider;

beforeEach(() => {
  ws = {
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as any;
  sendPayload = jest.fn();
  wsProvider = new AlchemyWebSocketProvider(ws as any, sendPayload);
});

afterEach(() => {
  wsProvider.disconnect();
});

describe("AlchemyWebSocketProvider", () => {
  it("sends and receives payloads", async () => {
    let resolve: (result: JsonRpcResponse) => void = undefined!;
    const promise = new Promise<JsonRpcResponse>(r => (resolve = r));
    sendPayload.mockReturnValue(promise);
    const result = wsProvider.send("eth_getBlockByNumber", ["latest", false]);
    expect(sendPayload).toHaveBeenCalledWith({
      jsonrpc: "2.0",
      id: expect.anything(),
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    });
    const { id } = sendPayload.mock.calls[0][0];
    resolve({ id, jsonrpc: "2.0", result: "Some block" });
    expect(await result).toEqual("Some block");
  });
});
