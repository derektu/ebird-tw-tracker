export type ApiKeySource = "environment" | "settings" | "none";

export interface ApiKeySettings {
  configured: boolean;
  source: ApiKeySource;
  editable: boolean;
}
