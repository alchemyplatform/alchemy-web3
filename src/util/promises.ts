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
