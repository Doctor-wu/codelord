import { describe, it, expect } from 'vitest'
import { ToolRouter } from '../src/tool-router.js'

describe('ToolRouter', () => {
  const router = new ToolRouter()

  // -----------------------------------------------------------------------
  // Direct built-in calls pass through unchanged
  // -----------------------------------------------------------------------

  describe('passthrough (non-bash tools)', () => {
    it('file_read passes through unchanged', () => {
      const d = router.route('file_read', { file_path: 'foo.ts' })
      expect(d.wasRouted).toBe(false)
      expect(d.resolvedToolName).toBe('file_read')
      expect(d.resolvedArgs).toEqual({ file_path: 'foo.ts' })
      expect(d.ruleId).toBeNull()
    })

    it('file_write passes through unchanged', () => {
      const d = router.route('file_write', { file_path: 'x', content: 'y' })
      expect(d.wasRouted).toBe(false)
      expect(d.resolvedToolName).toBe('file_write')
    })

    it('search passes through unchanged', () => {
      const d = router.route('search', { query: 'foo' })
      expect(d.wasRouted).toBe(false)
      expect(d.resolvedToolName).toBe('search')
    })

    it('ls passes through unchanged', () => {
      const d = router.route('ls', { path: '/tmp' })
      expect(d.wasRouted).toBe(false)
      expect(d.resolvedToolName).toBe('ls')
    })
  })

  // -----------------------------------------------------------------------
  // Rule A: bash cat → file_read
  // -----------------------------------------------------------------------

  describe('Rule A: bash cat → file_read', () => {
    it('routes simple cat', () => {
      const d = router.route('bash', { command: 'cat src/index.ts' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedToolName).toBe('file_read')
      expect(d.resolvedArgs).toEqual({ file_path: 'src/index.ts' })
      expect(d.ruleId).toBe('bash_cat_to_file_read')
    })

    it('routes cat with absolute path', () => {
      const d = router.route('bash', { command: 'cat /etc/hosts' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ file_path: '/etc/hosts' })
    })

    it('routes cat with quoted path', () => {
      const d = router.route('bash', { command: 'cat "path with spaces/file.ts"' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ file_path: 'path with spaces/file.ts' })
    })

    it('does NOT route cat with pipe', () => {
      const d = router.route('bash', { command: 'cat file.ts | grep foo' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route cat with redirect', () => {
      const d = router.route('bash', { command: 'cat file.ts > out.txt' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route cat with multiple files', () => {
      const d = router.route('bash', { command: 'cat file1.ts file2.ts' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route cat with wildcard', () => {
      const d = router.route('bash', { command: 'cat *.ts' })
      expect(d.wasRouted).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Rule B: bash head → file_read
  // -----------------------------------------------------------------------

  describe('Rule B: bash head → file_read', () => {
    it('routes head -n N file', () => {
      const d = router.route('bash', { command: 'head -n 20 src/main.ts' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedToolName).toBe('file_read')
      expect(d.resolvedArgs).toEqual({ file_path: 'src/main.ts', offset: 1, limit: 20 })
      expect(d.ruleId).toBe('bash_head_to_file_read')
    })

    it('routes head -N file (short form)', () => {
      const d = router.route('bash', { command: 'head -50 config.json' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ file_path: 'config.json', offset: 1, limit: 50 })
    })

    it('does NOT route head with pipe', () => {
      const d = router.route('bash', { command: 'head -n 10 file.ts | cat' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route head without -n', () => {
      const d = router.route('bash', { command: 'head file.ts' })
      expect(d.wasRouted).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Rule C: bash ls → ls
  // -----------------------------------------------------------------------

  describe('Rule C: bash ls → ls', () => {
    it('routes bare ls', () => {
      const d = router.route('bash', { command: 'ls' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedToolName).toBe('ls')
      expect(d.resolvedArgs).toEqual({})
      expect(d.ruleId).toBe('bash_ls_to_ls')
    })

    it('routes ls with path', () => {
      const d = router.route('bash', { command: 'ls src/tools' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ path: 'src/tools' })
    })

    it('routes ls -R', () => {
      const d = router.route('bash', { command: 'ls -R' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ recursive: true })
    })

    it('routes ls -R with path', () => {
      const d = router.route('bash', { command: 'ls -R src' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ recursive: true, path: 'src' })
    })

    it('does NOT route ls -la (complex flags)', () => {
      const d = router.route('bash', { command: 'ls -la' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route ls with pipe', () => {
      const d = router.route('bash', { command: 'ls | grep foo' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route ls -al', () => {
      const d = router.route('bash', { command: 'ls -al src' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route ls -r (reverse sort, not recursive)', () => {
      const d = router.route('bash', { command: 'ls -r' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route ls -lr', () => {
      const d = router.route('bash', { command: 'ls -lr' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route ls -aR', () => {
      const d = router.route('bash', { command: 'ls -aR' })
      expect(d.wasRouted).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Rule D: bash rg/grep → search
  // -----------------------------------------------------------------------

  describe('Rule D: bash rg/grep → search', () => {
    it('routes simple rg query', () => {
      const d = router.route('bash', { command: 'rg "TODO" src' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedToolName).toBe('search')
      expect(d.resolvedArgs).toEqual({ query: 'TODO', path: 'src' })
      expect(d.ruleId).toBe('bash_search_to_search')
    })

    it('routes rg with just a query', () => {
      const d = router.route('bash', { command: 'rg createToolKernel' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ query: 'createToolKernel' })
    })

    it('routes rg with --glob', () => {
      const d = router.route('bash', { command: 'rg "import" --glob "*.ts"' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ query: 'import', glob: '*.ts' })
    })

    it('routes rg with -- separator', () => {
      const d = router.route('bash', { command: 'rg -- "pattern" ./src' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ query: 'pattern', path: './src' })
    })

    it('routes grep -rn', () => {
      const d = router.route('bash', { command: 'grep -rn "TODO" src/' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedToolName).toBe('search')
      expect(d.resolvedArgs).toEqual({ query: 'TODO', path: 'src/' })
    })

    it('routes grep -Rn', () => {
      const d = router.route('bash', { command: 'grep -Rn "pattern" .' })
      expect(d.wasRouted).toBe(true)
      expect(d.resolvedArgs).toEqual({ query: 'pattern', path: '.' })
    })

    it('does NOT route rg with pipe', () => {
      const d = router.route('bash', { command: 'rg "foo" | head -5' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route grep without -r', () => {
      const d = router.route('bash', { command: 'grep "foo" file.ts' })
      expect(d.wasRouted).toBe(false)
    })

    it('does NOT route rg with unknown flags', () => {
      const d = router.route('bash', { command: 'rg --pcre2 "foo"' })
      expect(d.wasRouted).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Complex bash — must NOT be routed
  // -----------------------------------------------------------------------

  describe('complex bash commands are NOT routed', () => {
    const complexCases = [
      'cat file.ts && echo done',
      'cat file.ts || true',
      'echo "hello" > file.txt',
      'sed -i "s/foo/bar/g" file.ts',
      'printf "content" > file.ts',
      'cp src/a.ts src/b.ts',
      'mv old.ts new.ts',
      'rm -rf dist',
      'touch newfile.ts',
      'find . -name "*.ts"',
      'cat file.ts; echo done',
      'echo $(cat file.ts)',
      'npm test',
      'git status',
    ]

    for (const cmd of complexCases) {
      it(`does NOT route: ${cmd}`, () => {
        const d = router.route('bash', { command: cmd })
        expect(d.wasRouted).toBe(false)
        expect(d.resolvedToolName).toBe('bash')
      })
    }
  })

  // -----------------------------------------------------------------------
  // Route metadata observability
  // -----------------------------------------------------------------------

  describe('route metadata', () => {
    it('routed decision has ruleId and reason', () => {
      const d = router.route('bash', { command: 'cat foo.ts' })
      expect(d.wasRouted).toBe(true)
      expect(d.ruleId).toBe('bash_cat_to_file_read')
      expect(d.reason).toContain('cat')
      expect(d.originalToolName).toBe('bash')
      expect(d.originalArgs).toEqual({ command: 'cat foo.ts' })
      expect(d.resolvedToolName).toBe('file_read')
    })

    it('non-routed decision has null ruleId and reason', () => {
      const d = router.route('bash', { command: 'npm install' })
      expect(d.wasRouted).toBe(false)
      expect(d.ruleId).toBeNull()
      expect(d.reason).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('empty command is not routed', () => {
      const d = router.route('bash', { command: '' })
      expect(d.wasRouted).toBe(false)
    })

    it('missing command arg is not routed', () => {
      const d = router.route('bash', {})
      expect(d.wasRouted).toBe(false)
    })

    it('non-string command is not routed', () => {
      const d = router.route('bash', { command: 42 })
      expect(d.wasRouted).toBe(false)
    })
  })
})
