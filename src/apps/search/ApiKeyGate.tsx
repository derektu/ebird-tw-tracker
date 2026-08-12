import { FormEvent, useState } from "react";

type ApiKeyGateProps = {
  busy: boolean;
  error: string | null;
  onSubmit: (apiKey: string) => Promise<void>;
};

export function ApiKeyGate({ busy, error, onSubmit }: ApiKeyGateProps) {
  const [apiKey, setApiKey] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(apiKey.trim());
  }

  return (
    <main className="search-app-shell">
      <section className="api-key-card" aria-labelledby="api-key-gate-title">
        <p className="search-app-eyebrow">eBird Taiwan Search</p>
        <h1 id="api-key-gate-title">輸入你的 eBird API key</h1>
        <p>
          Search App 會先在同源 API 驗證你的 key。驗證成功後，key 只保存在目前瀏覽器與網站 origin。
        </p>
        <form onSubmit={submit}>
          <label htmlFor="ebird-api-key">eBird API key</label>
          <input
            id="ebird-api-key"
            name="apiKey"
            type="password"
            autoComplete="off"
            required
            value={apiKey}
            disabled={busy}
            onChange={(event) => setApiKey(event.target.value)}
          />
          {error && <p className="api-key-error" role="alert">{error}</p>}
          <button className="search-app-primary" type="submit" disabled={busy}>
            {busy ? "正在驗證…" : "驗證 API key"}
          </button>
        </form>
      </section>
    </main>
  );
}
