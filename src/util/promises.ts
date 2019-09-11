import { Web3Callback } from "../types";

/**
 * Helper for converting functions which take a callback as their final argument
 * to functions which return a promise.
 */
export function promisify<T>(
  f: (callback: Web3Callback<T>) => void,
): Promise<T> {
  return new Promise((resolve, reject) =>
    f((error, result) => {
      if (error != null) {
        reject(error);
      } else {
        resolve(result);
      }
    }),
  );
}

/**
 * Helper for converting functions which return a promise to functions which
 * take a callback as their final argument.
 */
export function callWhenDone<T>(
  promise: Promise<T>,
  callback: Web3Callback<T>,
): void {
  promise.then(result => callback(null, result), error => callback(error));
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms),
    ),
  ]);
}

const MIN_RETRY_DELAY = 1000;
const RETRY_BACKOFF_FACTOR = 2;
const MAX_RETRY_DELAY = 30000;

export async function withBackoffRetries<T>(
  f: () => Promise<T>,
  retryCount: number,
): Promise<T> {
  let nextWaitTime = 0;
  let i = 0;
  while (true) {
    try {
      return await f();
    } catch (error) {
      i++;
      if (i >= retryCount) {
        throw error;
      }
      await delay(nextWaitTime);
      nextWaitTime =
        nextWaitTime === 0
          ? MIN_RETRY_DELAY
          : Math.min(MAX_RETRY_DELAY, RETRY_BACKOFF_FACTOR * nextWaitTime);
    }
  }
}
