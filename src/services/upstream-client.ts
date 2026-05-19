import type { AnthropicRequest, AnthropicResponse } from "../types/anthropic.js";
import type { XAIRequest, XAIResponse } from "../types/xai.js";

export class UpstreamError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface UpstreamClient {
  callAnthropic(
    request: AnthropicRequest,
    apiKey: string,
    baseUrl: string,
    version: string
  ): Promise<Response>;

  callXAI(
    request: XAIRequest,
    apiKey: string,
    baseUrl: string
  ): Promise<Response>;
}

export function createUpstreamClient(): UpstreamClient {
  async function callAnthropic(
    request: AnthropicRequest,
    apiKey: string,
    baseUrl: string,
    version: string
  ): Promise<Response> {
    const url = `${baseUrl}/v1/messages`;
    const headers: Record<string, string> = {
      "x-api-key": apiKey,
      "anthropic-version": version,
      "content-type": "application/json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(errorBody);
      } catch {
        parsed = { error: errorBody };
      }
      throw new UpstreamError(
        response.status,
        parsed,
        `Anthropic upstream error: ${response.status}`
      );
    }

    return response;
  }

  async function callXAI(
    request: XAIRequest,
    apiKey: string,
    baseUrl: string
  ): Promise<Response> {
    const url = `${baseUrl}/v1/responses`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(errorBody);
      } catch {
        parsed = { error: errorBody };
      }
      throw new UpstreamError(
        response.status,
        parsed,
        `XAI upstream error: ${response.status}`
      );
    }

    return response;
  }

  return { callAnthropic, callXAI };
}

/** Parse Anthropic JSON response */
export async function parseAnthropicResponse(
  response: Response
): Promise<AnthropicResponse> {
  return (await response.json()) as AnthropicResponse;
}

/** Parse XAI JSON response */
export async function parseXaiResponse(
  response: Response
): Promise<XAIResponse> {
  return (await response.json()) as XAIResponse;
}
