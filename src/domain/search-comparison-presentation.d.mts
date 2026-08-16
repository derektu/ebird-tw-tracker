import type { SearchComparison } from "./search-discovery.mjs";

export interface SearchComparisonPresentation {
  compactText: string | null;
  compactTone: "accent" | "muted" | null;
  assistiveStatus: string | null;
  warningText: string | null;
}

export function presentSearchComparison(
  comparison: SearchComparison | null | undefined,
): SearchComparisonPresentation;
