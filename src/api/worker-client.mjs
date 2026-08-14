const defaultTimeoutMs = 5_000;

export class ApiKeyValidationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiKeyValidationError";
    this.status = status;
  }
}

function isLoopback(location) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);
}

function assertSecureTransport(location) {
  if (location.protocol === "https:" || (location.protocol === "http:" && isLoopback(location))) return;
  throw new ApiKeyValidationError(0, "API key 只能在 HTTPS 或本機 preview 中驗證");
}

export async function validateBrowserApiKey(apiKey, {
  location = window.location,
  request = fetch,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  assertSecureTransport(location);

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await request("/api/key/validate", {
      method: "POST",
      headers: { "X-eBird-Api-Key": apiKey },
      signal: controller.signal,
    });
  } catch {
    throw new ApiKeyValidationError(0, timedOut
      ? "驗證 API key 逾時，請稍後再試"
      : "目前無法驗證 API key，請確認網路後再試");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.valid !== true) {
    throw new ApiKeyValidationError(response.status, payload.error || "目前無法驗證 API key，請稍後再試");
  }
}
