import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin, ToolPluginContext } from '@codelord/core'
import type { ToolHandler, ToolExecutionResult } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// web_search — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
  name: 'web_search',
  description: [
    'Search the web using a query string and return a list of results.',
    'Each result includes a title, URL, and text snippet.',
    'Use this to find information, locate web pages, or research topics.',
    'For reading the full content of a specific URL, use web_fetch instead.',
  ].join(' '),
  parameters: Type.Object({
    query: Type.String({ description: 'The search query string.' }),
    limit: Type.Optional(
      Type.Number({ description: 'Maximum number of results to return. Defaults to 5, max 20.' }),
    ),
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// web_search — handler factory
// ---------------------------------------------------------------------------

function createWebSearchHandler(ctx: ToolPluginContext): ToolHandler {
  const apiKey = (ctx.config.apiKey as string | undefined) ?? ctx.env.TAVILY_API_KEY

  return async (args): Promise<ToolExecutionResult> => {
    if (!apiKey) {
      return {
        output: 'ERROR [CONFIG_ERROR]: Tavily API key not configured. Set TAVILY_API_KEY environment variable.',
        isError: true,
        errorCode: 'CONFIG_ERROR',
      }
    }
    const query = args.query as string | undefined
    if (!query || typeof query !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: query is required and must be a string.', isError: true, errorCode: 'INVALID_ARGS' }
    }

    const limit = Math.min(Math.max(1, Number(args.limit) || 5), 20)

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
          include_answer: false,
          include_raw_content: false,
        }),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        return {
          output: `ERROR [API_ERROR]: Tavily API returned HTTP ${response.status}: ${body.slice(0, 500)}`,
          isError: true,
          errorCode: 'API_ERROR',
        }
      }

      const data = await response.json() as {
        results?: Array<{ title?: string; url?: string; content?: string }>
      }

      const results = data.results ?? []
      if (results.length === 0) {
        return { output: `No results found for "${query}".`, isError: false }
      }

      const formatted = results.map((r, i) => {
        const title = r.title ?? '(no title)'
        const url = r.url ?? '(no url)'
        const snippet = r.content ?? '(no snippet)'
        return `${i + 1}. ${title}\n   URL: ${url}\n   ${snippet}`
      }).join('\n\n')

      return { output: `Found ${results.length} results for "${query}":\n\n${formatted}`, isError: false }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return { output: 'ERROR [NETWORK_ERROR]: Tavily API request timed out after 30s.', isError: true, errorCode: 'NETWORK_ERROR' }
      }
      return {
        output: `ERROR [NETWORK_ERROR]: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        errorCode: 'NETWORK_ERROR',
      }
    }
  }
}
// ---------------------------------------------------------------------------
// web_search — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'web_search',
  whenToUse: [
    'Finding information on the web about any topic.',
    'Locating specific web pages, documentation, or resources.',
    'Researching a topic before taking action.',
    'Finding answers to factual questions that are not in the current codebase.',
  ],
  whenNotToUse: [
    'Do not use when you already have the URL — use web_fetch instead.',
    'Do not use for reading local files — use file_read.',
    'Do not use for searching code in the current project — use search.',
  ],
  preconditions: [
    'TAVILY_API_KEY must be configured (via environment variable or tool config).',
  ],
  failureSemantics: [
    'CONFIG_ERROR: Tavily API key not configured.',
    'INVALID_ARGS: query is missing.',
    'API_ERROR: Tavily API returned an error.',
    'NETWORK_ERROR: Could not reach Tavily API.',
  ],
  fallbackHints: [
    'If search returns no results, try rephrasing the query with different keywords.',
    'If API key is missing, inform the user that web_search requires TAVILY_API_KEY.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const webSearchPlugin: ToolPlugin = {
  id: 'web_search',
  tool,
  createHandler: (ctx) => createWebSearchHandler(ctx),
  contract,
  riskLevel: 'safe',
  category: 'optional',
  requiredEnv: ['TAVILY_API_KEY'],
}
