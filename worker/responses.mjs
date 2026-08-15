export function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function error(status, code, message) {
  return json(status, { code, error: message });
}
