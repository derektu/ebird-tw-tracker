export class ApiKeyValidationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiKeyValidationError";
    this.status = status;
  }
}

export async function validateBrowserApiKey(apiKey: string) {
  let response: Response;
  try {
    response = await fetch("/api/key/validate", {
      method: "POST",
      headers: { "X-eBird-Api-Key": apiKey },
    });
  } catch {
    throw new ApiKeyValidationError(0, "目前無法驗證 API key，請確認網路後再試");
  }

  const payload = await response.json().catch(() => ({})) as { valid?: boolean; error?: string };
  if (!response.ok || payload.valid !== true) {
    throw new ApiKeyValidationError(response.status, payload.error || "目前無法驗證 API key，請稍後再試");
  }
}
