export class ApiKeyValidationError extends Error {
  status: number;
}

export function validateBrowserApiKey(
  apiKey: string,
  options?: {
    location?: Location | URL;
    request?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<void>;
