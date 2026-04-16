import { registerBenchmarkRenderer } from '@codelord/evals-shared'

export function registerPolyglotRenderer(): void {
  registerBenchmarkRenderer('polyglot', (result) => {
    const byLanguage = new Map<string, { total: number; passAttempt1: number; passAttempt2: number }>()

    for (const caseResult of result.cases) {
      const metadata = caseResult.metadata ?? {}
      const language = typeof metadata.language === 'string' ? metadata.language : 'unknown'
      const passedAttempt1 = metadata.passedAttempt1 === true
      const passedAttempt2 = metadata.passedAttempt2 === true || passedAttempt1
      const bucket = byLanguage.get(language) ?? { total: 0, passAttempt1: 0, passAttempt2: 0 }
      bucket.total += 1
      if (passedAttempt1) bucket.passAttempt1 += 1
      if (passedAttempt2) bucket.passAttempt2 += 1
      byLanguage.set(language, bucket)
    }

    if (byLanguage.size === 0) return ''

    const lines = [
      '### Polyglot Language Breakdown',
      '',
      '| language | total | pass@1 | pass@2 | pass_rate_1 | pass_rate_2 |',
      '| --- | --- | --- | --- | --- | --- |',
    ]

    for (const [language, stats] of [...byLanguage.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const passRate1 = stats.total > 0 ? stats.passAttempt1 / stats.total : 0
      const passRate2 = stats.total > 0 ? stats.passAttempt2 / stats.total : 0
      lines.push(
        `| ${language} | ${stats.total} | ${stats.passAttempt1} | ${stats.passAttempt2} | ${passRate1.toFixed(3)} | ${passRate2.toFixed(3)} |`,
      )
    }

    return lines.join('\n')
  })
}
