import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig, ModelMappings } from "../types/shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadModelMap(): ModelMappings {
  try {
    const raw = readFileSync(
      resolve(__dirname, "../../config/default.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    return {
      xaiToAnthropic: parsed.xaiToAnthropic ?? {},
      anthropicToXAI: parsed.anthropicToXAI ?? {},
    };
  } catch {
    return { xaiToAnthropic: {}, anthropicToXAI: {} };
  }
}

function envModelOverrides(
  map: ModelMappings
): ModelMappings {
  // Allow env overrides in format: MODEL_MAP_XAI_TO_ANTHROPIC=grok-4.3=claude-sonnet-4,grok-4=claude-opus-4
  const xaiOverride = process.env.MODEL_MAP_XAI_TO_ANTHROPIC;
  if (xaiOverride) {
    for (const pair of xaiOverride.split(",")) {
      const [from, to] = pair.split("=");
      if (from && to) map.xaiToAnthropic[from.trim()] = to.trim();
    }
  }
  const anthroOverride = process.env.MODEL_MAP_ANTHROPIC_TO_XAI;
  if (anthroOverride) {
    for (const pair of anthroOverride.split(",")) {
      const [from, to] = pair.split("=");
      if (from && to) map.anthropicToXAI[from.trim()] = to.trim();
    }
  }
  return map;
}

export function loadConfig(): AppConfig {
  const modelMap = envModelOverrides(loadModelMap());

  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    proxyApiKey: process.env.PROXY_API_KEY || undefined,
    xai: {
      apiKey: process.env.XAI_API_KEY ?? "",
      baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai",
      defaultModel: process.env.XAI_DEFAULT_MODEL ?? "grok-4.3",
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      baseUrl:
        process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
      defaultModel:
        process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-sonnet-4-20250514",
      version: process.env.ANTHROPIC_VERSION ?? "2023-06-01",
    },
    defaultMaxTokens: parseInt(
      process.env.DEFAULT_MAX_TOKENS ?? "4096",
      10
    ),
    stateManagerTtl: parseInt(
      process.env.STATE_MANAGER_TTL ?? "2592000000",
      10
    ),
    modelMap,
  };
}
