import { useRef } from "react";
import { spotName } from "./BirdSpotPanel";
import {
  matchingFavorites,
  type BirdSpotSearch,
  type BirdSpotSearchItem,
} from "./useBirdSpotSearch";
import type { DesktopBirdSpots } from "./useDesktopBirdSpots";

export function BirdSpotSearchResults({
  search,
  model,
}: {
  search: BirdSpotSearch;
  model: DesktopBirdSpots;
}) {
  const scrollTop = useRef(0);
  const { state } = search;
  const active = model.workspaceView.kind === "spot-results";
  if (!active) return null;
  const response = state.kind === "ready" ? state.result : null;
  const results: BirdSpotSearchItem[] =
    response?.spots ??
    (state.kind === "error" ? matchingFavorites(model, state.query) : []);
  return (
    <aside className="side bird-spot-search-panel" aria-label="鳥點搜尋結果">
      <section className="bird-spot-heading">
        <h2>鳥點名稱搜尋</h2>
        <p className="bird-spot-meta">
          公共熱點與我的收藏，不包含尚未收藏的個人地點。可用名稱或地區代碼搜尋。
        </p>
        {response && (
          <p className="bird-spot-meta">
            {response.status === "fresh"
              ? "公共目錄"
              : response.status === "stale"
                ? "公共目錄使用舊資料"
                : "公共目錄暫不可用"}
            {response.updatedAt
              ? ` · 取得於 ${new Date(response.updatedAt).toLocaleString("zh-TW")}`
              : " · 尚無公共目錄取得時間"}
          </p>
        )}
        {response?.error && (
          <p className="bird-spot-directory-warning" role="alert">
            {response.error.message}。自己的收藏仍可搜尋。
          </p>
        )}
        {state.kind === "error" && (
          <p className="bird-spot-directory-warning" role="alert">
            {state.message}。以下顯示這台電腦的收藏。
          </p>
        )}
        {(response?.error || state.kind === "error") && (
          <button className="secondary" onClick={() => void search.search()}>
            重試搜尋鳥點
          </button>
        )}
      </section>
      <div
        className="list"
        ref={(node) => {
          if (node) node.scrollTop = scrollTop.current;
        }}
        onScroll={(event) => {
          scrollTop.current = event.currentTarget.scrollTop;
        }}
      >
        {state.kind === "loading" && <p className="empty">正在搜尋鳥點…</p>}
        {state.kind === "idle" && (
          <p className="empty">輸入名稱或地區代碼後搜尋鳥點。</p>
        )}
        {(state.kind === "ready" || state.kind === "error") &&
          !results.length && <p className="empty">沒有符合條件的鳥點。</p>}
        {results.map((spot) => {
          const saved = model.saved(spot.locId);
          const alias = model.available ? saved?.alias : spot.alias;
          const region = [spot.subnational1Code, spot.subnational2Code]
            .filter(Boolean)
            .join(" · ");
          return (
            <article className="item bird-spot-search-item" key={spot.locId}>
              <h3>{alias || spotName(spot)}</h3>
              {alias && <p>{spotName(spot)}</p>}
              {spot.englishName && (
                <p className="bird-spot-meta">{spot.englishName}</p>
              )}
              <p className="bird-spot-meta">
                {region ? `${region} · ` : ""}
                {spot.locationType === "hotspot"
                  ? "公共熱點"
                  : spot.locationType === "personal"
                    ? "個人地點"
                    : "地點類型未知"}{" "}
                · {spot.locId}
              </p>
              <div className="bird-spot-actions">
                <button
                  className="primary"
                  onClick={() => model.open(spot, null, "spot-results")}
                >
                  查看近期鳥種
                </button>
                <button
                  className="secondary"
                  disabled={!model.available || model.pending.has(spot.locId)}
                  onClick={() => void model.toggle(spot)}
                >
                  {saved ? "★ 已收藏" : "☆ 收藏鳥點"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
