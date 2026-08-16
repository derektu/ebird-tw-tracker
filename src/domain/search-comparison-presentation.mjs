export function presentSearchComparison(comparison) {
  if (!comparison) {
    return { compactText: null, compactTone: null, assistiveStatus: null, warningText: null };
  }

  if (comparison.status === "baseline-created") {
    return {
      compactText: null,
      compactTone: null,
      assistiveStatus: "已建立搜尋比較基準",
      warningText: null,
    };
  }

  if (comparison.status === "unavailable") {
    return {
      compactText: null,
      compactTone: null,
      assistiveStatus: null,
      warningText: comparison.reason === "initial-save-failed"
        ? "無法建立搜尋比較基準；已顯示一般搜尋結果。"
        : "無法使用搜尋比較；已顯示一般搜尋結果。",
    };
  }
  const compactText = comparison.discoveryIds.length ? `新增 ${comparison.discoveryIds.length} 筆` : "沒有新增";
  return {
    compactText,
    compactTone: comparison.discoveryIds.length ? "accent" : "muted",
    assistiveStatus: comparison.snapshotCommit === "save-failed" ? null : compactText,
    warningText: comparison.snapshotCommit === "save-failed"
      ? "比較基準未更新；下次可能重複顯示新增紀錄。"
      : null,
  };
}
