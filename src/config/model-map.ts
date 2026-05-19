import type { ModelMappings, TranslationDirection } from "../types/shared.js";

let mappings: ModelMappings = { xaiToAnthropic: {}, anthropicToXAI: {} };

export function initModelMap(map: ModelMappings): void {
  mappings = map;
}

export function mapModel(
  model: string,
  direction: TranslationDirection
): string {
  if (direction === "xai-to-anthropic") {
    return mappings.xaiToAnthropic[model] ?? mappings.xaiToAnthropic["*"] ?? model;
  }
  return mappings.anthropicToXAI[model] ?? mappings.anthropicToXAI["*"] ?? model;
}
