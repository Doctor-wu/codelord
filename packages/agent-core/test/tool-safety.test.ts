import { describe, it, expect } from 'vitest'
import { ToolSafetyPolicy } from '../src/tool-safety.js'
import type { RiskLevel } from '../src/tool-safety.js'

describe('ToolSafetyPolicy', () => {
  const policy = new ToolSafetyPolicy({ cwd: '/tmp/project' })

  // -----------------------------------------------------------------------
  // Static tool risk levels
  // -----------------------------------------------------------------------

  describe('static tool risk', () => {
    it('file_read is safe', () => {
      const d = policy.assess('file_read', { file_path: 'foo.ts' })
      expect(d.riskLevel).toBe('safe')
      expect(d.allowed).toBe(true)
      expect(d.wasBlocked).toBe(false)
    })

    it('search is safe', () => {
      const d = policy.assess('search', { query: 'TODO' })
      expect(d.riskLevel).toBe('safe')
      expect(d.allowed).toBe(true)
    })

    it('ls is safe', () => {
      const d = policy.assess('ls', { path: '/tmp' })
      expect(d.riskLevel).toBe('safe')
      expect(d.allowed).toBe(true)
    })

    it('file_write is write', () => {
      const d = policy.assess('file_write', { file_path: 'foo.ts', content: 'x' })
      expect(d.riskLevel).toBe('write')
      expect(d.allowed).toBe(true)
      expect(d.wasBlocked).toBe(false)
    })

    it('file_edit is write', () => {
      const d = policy.assess('file_edit', { file_path: 'foo.ts', old_string: 'a', new_string: 'b' })
      expect(d.riskLevel).toBe('write')
      expect(d.allowed).toBe(true)
    })

    it('AskUserQuestion is control', () => {
      const d = policy.assess('AskUserQuestion', { question: 'what?' })
      expect(d.riskLevel).toBe('control')
      expect(d.allowed).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Bash: safe commands
  // -----------------------------------------------------------------------

  describe('bash safe commands', () => {
    const safeCases = [
      'pwd',
      'whoami',
      'uname',
      'date',
      'echo hello',
      'cat src/index.ts',
      'head -n 20 file.ts',
      'tail -n 10 file.ts',
      'wc -l file.ts',
      'ls',
      'ls src',
      'tree',
      'rg TODO src',
      'grep -rn pattern .',
      'find . -name "*.ts"',
      'git status',
      'git diff',
      'git log',
      'git show HEAD',
      'git branch',
      'git branch --list',
      'git branch --show-current',
      'node -v',
      'python --version',
      'pnpm -v',
    ]

    for (const cmd of safeCases) {
      it(`"${cmd}" is safe`, () => {
        const d = policy.assess('bash', { command: cmd })
        expect(d.riskLevel).toBe('safe')
        expect(d.allowed).toBe(true)
      })
    }
  })

  // -----------------------------------------------------------------------
  // Bash: dangerous commands
  // -----------------------------------------------------------------------

  describe('bash dangerous commands', () => {
    const dangerousCases = [
      { cmd: 'rm -rf /tmp/foo', reason: 'rm -rf' },
      { cmd: 'rm -r dir/', reason: 'rm -r' },
      { cmd: 'sudo apt install foo', reason: 'sudo' },
      { cmd: 'chmod 777 file', reason: 'chmod' },
      { cmd: 'chown root file', reason: 'chown' },
      { cmd: 'dd if=/dev/zero of=/dev/sda', reason: 'dd' },
      { cmd: 'mkfs.ext4 /dev/sda1', reason: 'mkfs' },
      { cmd: 'shutdown -h now', reason: 'shutdown' },
      { cmd: 'reboot', reason: 'reboot' },
      { cmd: 'git reset --hard HEAD~1', reason: 'git reset --hard' },
      { cmd: 'git clean -fd', reason: 'git clean -f' },
      { cmd: 'git clean -fdx', reason: 'git clean -f' },
      { cmd: 'git checkout -- .', reason: 'git checkout --' },
      { cmd: 'git branch -D feature', reason: 'git branch -D' },
      { cmd: 'git push --force origin main', reason: 'git push --force' },
      { cmd: 'git push -f origin main', reason: 'git push -f' },
    ]

    for (const { cmd, reason } of dangerousCases) {
      it(`"${cmd}" is dangerous (${reason})`, () => {
        const d = policy.assess('bash', { command: cmd })
        expect(d.riskLevel).toBe('dangerous')
        expect(d.allowed).toBe(false)
        expect(d.wasBlocked).toBe(true)
      })
    }
  })

  // -----------------------------------------------------------------------
  // Bash: write commands
  // -----------------------------------------------------------------------

  describe('bash write commands', () => {
    const writeCases = [
      'mkdir -p src/new',
      'touch newfile.ts',
      'cp src/a.ts src/b.ts',
      'mv old.ts new.ts',
      'npm install express',
      'pnpm install',
      'yarn install',
      'bun install',
    ]

    for (const cmd of writeCases) {
      it(`"${cmd}" is write`, () => {
        const d = policy.assess('bash', { command: cmd })
        expect(d.riskLevel).toBe('write')
        expect(d.allowed).toBe(true)
      })
    }
  })

  // -----------------------------------------------------------------------
  // Bash: unknown defaults to write
  // -----------------------------------------------------------------------

  describe('bash unknown defaults to write', () => {
    it('unknown command defaults to write', () => {
      const d = policy.assess('bash', { command: 'some-custom-script --flag' })
      expect(d.riskLevel).toBe('write')
      expect(d.allowed).toBe(true)
      expect(d.ruleId).toBe('bash_default_write')
    })
  })

  // -----------------------------------------------------------------------
  // git branch / find: safe subset vs mutating
  // -----------------------------------------------------------------------

  describe('git branch safe boundary', () => {
    it('git branch foo is NOT safe (creates branch)', () => {
      const d = policy.assess('bash', { command: 'git branch foo' })
      expect(d.riskLevel).not.toBe('safe')
    })

    it('git branch -d foo is NOT safe (deletes branch)', () => {
      const d = policy.assess('bash', { command: 'git branch -d foo' })
      expect(d.riskLevel).not.toBe('safe')
    })

    it('git branch -m old new is NOT safe (renames branch)', () => {
      const d = policy.assess('bash', { command: 'git branch -m old new' })
      expect(d.riskLevel).not.toBe('safe')
    })
  })

  describe('find safe boundary', () => {
    it('find . -name "*.ts" is safe (read-only)', () => {
      const d = policy.assess('bash', { command: 'find . -name "*.ts"' })
      expect(d.riskLevel).toBe('safe')
    })

    it('find . -type f is safe', () => {
      const d = policy.assess('bash', { command: 'find . -type f' })
      expect(d.riskLevel).toBe('safe')
    })

    it('find . -delete is NOT safe', () => {
      const d = policy.assess('bash', { command: 'find . -delete' })
      expect(d.riskLevel).not.toBe('safe')
    })

    it('find . -exec rm {} \\; is NOT safe', () => {
      const d = policy.assess('bash', { command: 'find . -exec rm {} \\;' })
      expect(d.riskLevel).not.toBe('safe')
    })

    it('find . -execdir chmod 777 {} \\; is NOT safe', () => {
      const d = policy.assess('bash', { command: 'find . -execdir chmod 777 {} \\;' })
      expect(d.riskLevel).not.toBe('safe')
    })

    it('find . -ok rm {} \\; is NOT safe', () => {
      const d = policy.assess('bash', { command: 'find . -ok rm {} \\;' })
      expect(d.riskLevel).not.toBe('safe')
    })
  })

  // -----------------------------------------------------------------------
  // Sensitive path protection
  // -----------------------------------------------------------------------

  describe('sensitive path protection', () => {
    it('file_write to ~/.ssh is dangerous', () => {
      const home = require('node:os').homedir()
      const p = new ToolSafetyPolicy({ cwd: home })
      const d = p.assess('file_write', { file_path: '.ssh/authorized_keys', content: 'x' })
      expect(d.riskLevel).toBe('dangerous')
      expect(d.wasBlocked).toBe(true)
      expect(d.ruleId).toBe('sensitive_path_write')
    })

    it('file_edit to /etc/passwd is dangerous', () => {
      const d = policy.assess('file_edit', { file_path: '/etc/passwd', old_string: 'a', new_string: 'b' })
      expect(d.riskLevel).toBe('dangerous')
      expect(d.wasBlocked).toBe(true)
    })

    it('file_write to /System/Library is dangerous', () => {
      const d = policy.assess('file_write', { file_path: '/System/Library/foo', content: 'x' })
      expect(d.riskLevel).toBe('dangerous')
      expect(d.wasBlocked).toBe(true)
    })

    it('file_read from ~/.ssh is still safe (read-only)', () => {
      const d = policy.assess('file_read', { file_path: '/Users/test/.ssh/id_rsa' })
      expect(d.riskLevel).toBe('safe')
      expect(d.allowed).toBe(true)
    })

    it('file_write to normal path is write (not blocked)', () => {
      const d = policy.assess('file_write', { file_path: '/tmp/project/src/foo.ts', content: 'x' })
      expect(d.riskLevel).toBe('write')
      expect(d.allowed).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Safety decision metadata
  // -----------------------------------------------------------------------

  describe('decision metadata', () => {
    it('blocked decision has ruleId and reason', () => {
      const d = policy.assess('bash', { command: 'rm -rf /' })
      expect(d.wasBlocked).toBe(true)
      expect(d.ruleId).toBeTruthy()
      expect(d.reason).toBeTruthy()
      expect(d.toolName).toBe('bash')
    })

    it('allowed decision has ruleId and reason', () => {
      const d = policy.assess('file_read', { file_path: 'foo.ts' })
      expect(d.wasBlocked).toBe(false)
      expect(d.ruleId).toBeTruthy()
      expect(d.reason).toBeTruthy()
    })
  })

  // -----------------------------------------------------------------------
  // Unknown tool
  // -----------------------------------------------------------------------

  describe('unknown tool', () => {
    it('defaults to write', () => {
      const d = policy.assess('some_custom_tool', { arg: 'val' })
      expect(d.riskLevel).toBe('write')
      expect(d.allowed).toBe(true)
      expect(d.ruleId).toBe('unknown_tool_default')
    })
  })
})
