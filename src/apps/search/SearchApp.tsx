import { useCallback, useEffect, useState } from "react";
import { ApiKeyValidationError, validateBrowserApiKey } from "../../api/worker-client";
import { forgetBrowserApiKey, readBrowserApiKey, saveBrowserApiKey } from "../../storage/browser-api-key";
import { ApiKeyGate } from "./ApiKeyGate";

type GateState = "checking" | "gate" | "ready";

function messageFor(error: unknown) {
  return error instanceof ApiKeyValidationError ? error.message : "目前無法驗證 API key，請稍後再試";
}

export function SearchApp() {
  const [state, setState] = useState<GateState>(() => readBrowserApiKey() ? "checking" : "gate");
  const [error, setError] = useState<string | null>(null);

  const validateAndSave = useCallback(async (apiKey: string) => {
    if (!apiKey) {
      setError("請輸入有效的 eBird API key");
      return;
    }

    setState("checking");
    setError(null);
    try {
      await validateBrowserApiKey(apiKey);
      if (!saveBrowserApiKey(apiKey)) {
        setState("gate");
        setError("瀏覽器無法保存 API key，請允許這個網站使用 localStorage 後再試");
        return;
      }
      setState("ready");
    } catch (validationError) {
      setState("gate");
      setError(messageFor(validationError));
    }
  }, []);

  useEffect(() => {
    const savedApiKey = readBrowserApiKey();
    if (!savedApiKey) return;

    let disposed = false;
    setState("checking");
    setError(null);
    validateBrowserApiKey(savedApiKey).then(
      () => {
        if (!disposed) setState("ready");
      },
      (validationError) => {
        if (disposed) return;
        if (validationError instanceof ApiKeyValidationError && [401, 403].includes(validationError.status)) {
          forgetBrowserApiKey();
        }
        setState("gate");
        setError(messageFor(validationError));
      },
    );

    return () => { disposed = true; };
  }, []);

  if (state !== "ready") {
    return <ApiKeyGate busy={state === "checking"} error={error} onSubmit={validateAndSave} />;
  }

  return (
    <main className="search-app-shell">
      <section className="api-key-card search-app-ready" aria-labelledby="search-app-ready-title">
        <p className="search-app-eyebrow">eBird Taiwan Search</p>
        <h1 id="search-app-ready-title">Search App 已準備完成</h1>
        <p>你的 API key 已通過驗證。鳥種與 observation 搜尋會在後續功能完成後開放。</p>
        <button
          className="search-app-secondary"
          type="button"
          onClick={() => {
            forgetBrowserApiKey();
            setError(null);
            setState("gate");
          }}
        >
          忘記 API key
        </button>
      </section>
    </main>
  );
}
