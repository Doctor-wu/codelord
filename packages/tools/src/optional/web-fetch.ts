import { Type } from '@codelord/core'
import type { Tool } from '@codelord/core'
import type { ToolPlugin, ToolPluginContext } from '@codelord/core'
import type { ToolHandler, ToolExecutionResult } from '@codelord/core'
import type { ToolContract } from '@codelord/core'

// ---------------------------------------------------------------------------
// web_fetch — tool definition
// ---------------------------------------------------------------------------

const tool: Tool = {
  name: 'web_fetch',
  description: [
    'Fetch the content of a web page at a given URL and return it as clean markdown.',
    'Use this to read articles, documentation, web pages, or any URL content.',
    'The content is automatically cleaned and converted to markdown for easy reading.',
    'For finding URLs first, use web_search.',
  ].join(' '),
  parameters: Type.Object({
    url: Type.String({ description: 'The URL to fetch.' }),
    reason: Type.Optional(
      Type.String({ description: 'Brief explanation of why you are calling this tool for this specific step.' }),
    ),
  }),
}

// ---------------------------------------------------------------------------
// web_fetch — handler factory
// ---------------------------------------------------------------------------

function createWebFetchHandler(_ctx: ToolPluginContext): ToolHandler {
  return async (args): Promise<ToolExecutionResult> => {
    const url = args.url as string | undefined
    if (!url || typeof url !== 'string') {
      return { output: 'ERROR [INVALID_ARGS]: url is required and must be a string.', isError: true, errorCode: 'INVALID_ARGS' }
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return { output: `ERROR [INVALID_ARGS]: Invalid URL: ${url}`, isError: true, errorCode: 'INVALID_ARGS' }
    }
    if (!parsedUrl.protocol.startsWith('http')) {
      return { output: `ERROR [INVALID_ARGS]: Only http/https URLs are supported: ${url}`, isError: true, errorCode: 'INVALID_ARGS' }
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          'User-Agent': 'Codelord/1.0 (+https://github.com/user/codelord)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      })

      if (!response.ok) {
        return {
          output: `ERROR [API_ERROR]: HTTP ${response.status} ${response.statusText} for ${url}`,
          isError: true,
          errorCode: 'API_ERROR',
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const html = await response.text()

      let content: string
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        // Convert HTML to markdown using Turndown
        const mod = await import('turndown')
        const TurndownService = mod.default ?? mod
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
        })
        // Remove noisy tags before conversion
        turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe'])
        content = turndown.turndown(html)
      } else {
        // Non-HTML: return as-is (plain text, JSON, etc.)
        content = html
      }

      // Truncate if needed
      const MAX_LENGTH = 50_000
      const truncated = content.length > MAX_LENGTH
      const output = truncated
        ? content.slice(0, MAX_LENGTH) + '\n\n[Content truncated at 50000 characters]'
        : content

      return { output: `Content from ${url}:\n\n${output}`, isError: false }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return { output: `ERROR [NETWORK_ERROR]: Request timed out after 60s for ${url}`, isError: true, errorCode: 'NETWORK_ERROR' }
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
// web_fetch — contract
// ---------------------------------------------------------------------------

const contract: ToolContract = {
  toolName: 'web_fetch',
  whenToUse: [
    'Reading the full content of a web page when you have its URL.',
    'Fetching documentation, articles, or reference material from the web.',
    'Getting detailed information from a specific page found via web_search.',
  ],
  whenNotToUse: [
    'Do not use when you do not have a URL — use web_search first to find one.',
    'Do not use for reading local files — use file_read.',
    'Do not use for downloading binary files (images, PDFs, etc).',
  ],
  preconditions: [
    'You must have a valid HTTP/HTTPS URL.',
  ],
  failureSemantics: [
    'INVALID_ARGS: URL is missing or malformed.',
    'API_ERROR: Remote server returned an error (4xx/5xx).',
    'NETWORK_ERROR: Could not reach the URL (timeout, DNS, connection refused, etc).',
  ],
  fallbackHints: [
    'If a page cannot be fetched, try web_search to find an alternative source or mirror.',
    'If content is empty or garbled, the page may require JavaScript rendering.',
  ],
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const webFetchPlugin: ToolPlugin = {
  id: 'web_fetch',
  tool,
  createHandler: (ctx) => createWebFetchHandler(ctx),
  contract,
  riskLevel: 'safe',
  category: 'optional',
}
