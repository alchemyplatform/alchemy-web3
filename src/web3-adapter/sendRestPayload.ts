import fetchPonyfill from "fetch-ponyfill";
import { FullConfig } from "../types";
import { delay } from "../util/promises";

export interface RestPayloadSender {
  sendRestPayload: SendRestPayloadFunction;
}

export type SendRestPayloadFunction = (
  path: string,
  payload: Record<string, any>,
) => Promise<any>;

export interface RestPayloadConfig {
  url: string;
  config: FullConfig;
}

export function makeRestPayloadSender({
  url,
  config,
}: RestPayloadConfig): RestPayloadSender {
  // The rest payload sender only works for alchemy.com http endpoints.
  let error: string | undefined;
  if (/^wss?:\/\//.test(url)) {
    error = "Alchemy rest endpoints are not available via websockets";
  }
  if (!url.includes("alchemy")) {
    error =
      "Alchemy specific rest endpoints are not available with a non Alchemy provider.";
  }
  if (url.includes("alchemyapi.io")) {
    error =
      "Alchemy specific rest endpoints are not available with our legacy endpoints on alchemyapi.io, please switch over to alchemy.com";
  }

  const urlObject = new URL(url);
  const origin = urlObject.origin;
  const apiKey = urlObject.pathname.substring(
    urlObject.pathname.lastIndexOf("/") + 1,
  );

  const { fetch } = fetchPonyfill();

  const sendRestPayload = async (
    path: string,
    payload: Record<string, any>,
  ): Promise<any> => {
    if (error) {
      throw new Error(error);
    }
    const { maxRetries, retryInterval, retryJitter } = config;
    if (origin && apiKey) {
      const endpoint = new URL(origin);
      endpoint.search = new URLSearchParams(payload).toString();
      endpoint.pathname = apiKey + path;
      for (let i = 0; i < maxRetries + 1; i++) {
        const response = await fetch(endpoint.href);
        const { status } = response;
        switch (status) {
          case 200:
            return response.json();
          case 429:
            break;
          default:
            throw new Error(response.status + ":" + response.statusText);
        }
        await delay(retryInterval + ((retryJitter * Math.random()) | 0));
      }
      throw new Error(
        `Rate limited for ${maxRetries + 1} consecutive attempts.`,
      );
    }
    return Promise.resolve();
  };

  return {
    sendRestPayload,
  };
}
