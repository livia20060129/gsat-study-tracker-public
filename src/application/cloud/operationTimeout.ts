export interface OperationTimeoutOptions {
  timeoutMs: number;
  message: string;
  onTimeout?: () => void;
}

/** Stops an external operation from leaving the UI in a permanent busy state. */
export async function withOperationTimeout<T>(
  operation: PromiseLike<T>,
  options: OperationTimeoutOptions,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      options.onTimeout?.();
      reject(new Error(options.message));
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
