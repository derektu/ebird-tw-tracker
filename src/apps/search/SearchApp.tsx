import { useCallback, useEffect, useState } from "react";
import { ApiKeyValidationError, validateBrowserApiKey } from "../../api/worker-client.mjs";
import { forgetBrowserApiKey, readBrowserApiKey, saveBrowserApiKey } from "../../storage/browser-api-key";
import { ApiKeyGate } from "./ApiKeyGate";
import { SearchWorkspace } from "./SearchWorkspace";

type GateState = "checking" | "gate" | "ready";

function messageFor(error: unknown) {
  return error instanceof ApiKeyValidationError ? error.message : "目前無法驗證 API key，請稍後再試";
}

function clearInvalidBrowserApiKey(error: unknown) {
  if (error instanceof ApiKeyValidationError && [401, 403].includes(error.status)) {
    forgetBrowserApiKey();
  }
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
      clearInvalidBrowserApiKey(validationError);
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
        clearInvalidBrowserApiKey(validationError);
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
    <>
      <SearchWorkspace />
      <button
        className="search-app-secondary forget-key-button"
        type="button"
        onClick={() => {
          forgetBrowserApiKey();
          setError(null);
          setState("gate");
        }}
      >
        忘記 API key
      </button>
    </>
  );
}
