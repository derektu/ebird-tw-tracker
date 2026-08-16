import assert from "node:assert/strict";
import test from "node:test";
import { presentSearchComparison } from "../src/domain/search-comparison-presentation.mjs";

const snapshot = { scope: { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" }, recordedAt: "2026-08-16T00:00:00.000Z", identityIds: [] };

test("Search Comparison presentation keeps compact feedback and warnings distinct", () => {
  assert.deepEqual(presentSearchComparison({ status: "baseline-created", discoveryIds: [], snapshot }), {
    compactText: null,
    compactTone: null,
    assistiveStatus: "已建立搜尋比較基準",
    warningText: null,
  });
  assert.deepEqual(presentSearchComparison({ status: "compared", discoveryIds: ["grpsni1:S2"], snapshot, snapshotCommit: "saved" }), {
    compactText: "新增 1 筆",
    compactTone: "accent",
    assistiveStatus: "新增 1 筆",
    warningText: null,
  });
  assert.deepEqual(presentSearchComparison({ status: "compared", discoveryIds: [], snapshot, snapshotCommit: "saved" }), {
    compactText: "沒有新增",
    compactTone: "muted",
    assistiveStatus: "沒有新增",
    warningText: null,
  });
  assert.deepEqual(presentSearchComparison({ status: "compared", discoveryIds: ["grpsni1:S2"], snapshot, snapshotCommit: "save-failed" }), {
    compactText: "新增 1 筆",
    compactTone: "accent",
    assistiveStatus: null,
    warningText: "比較基準未更新；下次可能重複顯示新增紀錄。",
  });
  assert.equal(
    presentSearchComparison({ status: "unavailable", discoveryIds: [], reason: "initial-save-failed" }).warningText,
    "無法建立搜尋比較基準；已顯示一般搜尋結果。",
  );
  assert.equal(
    presentSearchComparison({ status: "unavailable", discoveryIds: [], reason: "baseline-read-failed" }).warningText,
    "無法使用搜尋比較；已顯示一般搜尋結果。",
  );
});
