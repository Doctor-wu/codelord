import { streamSimple } from '@mariozechner/pi-ai'
import type { Api, Model } from '@mariozechner/pi-ai'

/**
 * Grade an agent's answer against the reference answer using an LLM judge.
 * Uses streamSimple from pi-ai directly (no tool kernel needed).
 */
export async function gradeAnswer(opts: {
  question: string
  correctAnswer: string
  agentResponse: string
  graderModel: Model<Api>
  graderApiKey: string
}): Promise<{ grade: 'CORRECT' | 'INCORRECT'; reasoning: string; extractedAnswer: string }> {
  const { question, correctAnswer, agentResponse, graderModel, graderApiKey } = opts

  const graderPrompt = [
    'Judge whether the following [response] to [question] is correct or not based on the precise and unambiguous [correct_answer] below.',
    '',
    `[question]: ${question}`,
    '',
    `[correct_answer]: ${correctAnswer}`,
    '',
    `[response]: ${agentResponse}`,
    '',
    'Respond with a JSON object with the following fields:',
    '- "extracted_final_answer": The final exact answer extracted from the [response]. Put "None" if there is no exact, final answer to extract from the response.',
    '- "reasoning": Explain why the extracted_final_answer is correct or incorrect based on [correct_answer], focusing only on whether there are meaningful differences.',
    '- "correct": true or false',
    '',
    'Respond ONLY with the JSON object, no other text.',
  ].join('\n')

  try {
    // Collect text from stream events
    let text = ''
    const stream = streamSimple(graderModel, {
      messages: [{ role: 'user' as const, content: graderPrompt, timestamp: Date.now() }],
    }, { apiKey: graderApiKey })

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        text += event.delta
      }
    }
    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as {
      extracted_final_answer?: string
      reasoning?: string
      correct?: boolean
    }

    return {
      grade: parsed.correct ? 'CORRECT' : 'INCORRECT',
      reasoning: parsed.reasoning ?? '',
      extractedAnswer: parsed.extracted_final_answer ?? 'None',
    }
  } catch (err) {
    return {
      grade: 'INCORRECT',
      reasoning: `Grading failed: ${err instanceof Error ? err.message : String(err)}`,
      extractedAnswer: 'None',
    }
  }
}
