// Shared internal types for the proxy

export type TranslationDirection = "xai-to-anthropic" | "anthropic-to-xai";
export type ProviderName = "xai" | "anthropic";

export interface StoredConversation {
  responseId: string;
  model: string;
  messages: NormalizedMessage[];
  createdAt: number;
  expiresAt: number;
}

export interface NormalizedMessage {
  role: "system" | "user" | "assistant";
  content: string | NormalizedContentBlock[];
}

export type NormalizedContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface AppConfig {
  port: number;
  proxyApiKey?: string;
  xai: ProviderConfig;
  anthropic: ProviderConfig & { version: string };
  defaultMaxTokens: number;
  stateManagerTtl: number;
  modelMap: ModelMappings;
}

export interface ModelMappings {
  xaiToAnthropic: Record<string, string>;
  anthropicToXAI: Record<string, string>;
}
