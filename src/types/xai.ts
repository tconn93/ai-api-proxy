// XAI Responses API types
// Based on https://docs.x.ai/docs/api-reference#responses

export interface XAIRequest {
  model: string;
  input: XAIInputItem[];
  previous_response_id?: string | null;
  store?: boolean;
  stream?: boolean;
  tools?: XAITool[];
  tool_choice?: XAIToolChoice;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  include?: string[];
  response_format?: XAIResponseFormat;
  instructions?: string;
  parallel_tool_calls?: boolean;
}

export type XAIInputItem =
  | XAISystemMessage
  | XAIUserMessage
  | XAIAssistantMessage
  | XAIDeveloperMessage
  | XAIFunctionCallOutput;

export interface XAISystemMessage {
  role: "system";
  content: string | XAIContentPart[];
}

export interface XAIUserMessage {
  role: "user";
  content: string | XAIContentPart[];
}

export interface XAIAssistantMessage {
  role: "assistant";
  content: string | XAIContentPart[];
  id?: string;
}

export interface XAIDeveloperMessage {
  role: "developer";
  content: string | XAIContentPart[];
}

export interface XAIFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export type XAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: string };

export type XAITool =
  | XAIFunctionTool
  | XAIBuiltInTool;

export interface XAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface XAIBuiltInTool {
  type: "web_search" | "x_search" | "code_interpreter";
}

export type XAIToolChoice =
  | "auto"
  | "required"
  | "none"
  | { type: "function"; function: { name: string } };

export interface XAIResponseFormat {
  type: "json_schema";
  json_schema: Record<string, unknown>;
}

export interface XAIResponse {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  output: XAIOutputItem[];
  usage?: XAIUsage;
  status: XAIResponseStatus;
  previous_response_id?: string | null;
  parallel_tool_calls?: boolean;
}

export type XAIResponseStatus =
  | "completed"
  | "in_progress"
  | "failed"
  | "incomplete";

export type XAIOutputItem =
  | XAIOutputMessage
  | XAIOutputFunctionCall
  | XAIOutputError;

export interface XAIOutputMessage {
  type: "message";
  id: string;
  role: "assistant";
  content: string | XAIContentPart[];
  status?: "completed" | "in_progress" | "incomplete";
}

export interface XAIOutputFunctionCall {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: "completed" | "in_progress";
}

export interface XAIOutputError {
  type: "error";
  code: string;
  message: string;
}

export interface XAIUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

// XAI streaming events (based on OpenAI Responses SSE conventions)
export type XAIStreamEvent =
  | { type: "response.created"; response: XAIResponse }
  | { type: "response.in_progress"; response: XAIResponse }
  | { type: "response.output_text.delta"; item_id: string; output_index: number; content_index: number; delta: string }
  | { type: "response.output_text.done"; item_id: string; output_index: number; content_index: number; text: string }
  | { type: "response.function_call_arguments.delta"; item_id: string; output_index: number; delta: string }
  | { type: "response.function_call_arguments.done"; item_id: string; output_index: number; name: string; arguments: string }
  | { type: "response.output_item.added"; item: XAIOutputItem; output_index: number }
  | { type: "response.output_item.done"; item: XAIOutputItem; output_index: number }
  | { type: "response.completed"; response: XAIResponse }
  | { type: "response.failed"; response: XAIResponse }
  | { type: "error"; code: string; message: string };
