import type { ExtensionServerApi } from "@intentic/extension-api";

// The backend half of `contributes.tools` (extension API 2.20.0): the host owns the MCP transport, each call's deadline
// and the card lookup, and hands `serve` the card a server was mounted for. Typed here until the published
// @intentic/extension-api carries it; the manifest's engines range guarantees the host does.

export interface ToolCard {
    readonly id: string;
    readonly config: Readonly<Record<string, string>>;
}

export type ToolContent = { readonly type: "text"; readonly text: string } | { readonly type: "image"; readonly data: string; readonly mimeType: string };

export interface ToolResult {
    readonly content: readonly ToolContent[];
    readonly isError?: boolean;
}

export interface ToolCallContext {
    readonly signal: AbortSignal;
    readonly conversationId?: string;
}

export interface ToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Readonly<Record<string, unknown>>;
    readonly call: (args: Readonly<Record<string, unknown>>, context: ToolCallContext) => Promise<ToolResult | string | unknown> | ToolResult | string | unknown;
}

export interface ToolsApi {
    serve(tools: (card: ToolCard | undefined) => readonly ToolDefinition[] | Promise<readonly ToolDefinition[]>): void;
}

export const toolsOf = (api: ExtensionServerApi): ToolsApi => (api as ExtensionServerApi & { readonly tools: ToolsApi }).tools;
