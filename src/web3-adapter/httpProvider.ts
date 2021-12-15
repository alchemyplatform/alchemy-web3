import {
  SingleOrBatchRequest,
  SingleOrBatchResponse,
  Web3Callback,
} from "../types";
import { callWhenDone } from "../util/promises";
import { SendJsonRpcPayloadFunction } from "./sendJsonRpcPayload";

/**
 * Returns a "provider" which can be passed to the Web3 constructor.
 */
export function makeAlchemyHttpProvider(
  sendJsonRpcPayload: SendJsonRpcPayloadFunction,
) {
  function send(
    payload: SingleOrBatchRequest,
    callback: Web3Callback<SingleOrBatchResponse>,
  ): void {
    callWhenDone(sendJsonRpcPayload(payload), callback);
  }
  return { send };
}
