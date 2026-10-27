export type InputQuestion = {
  id: string
  prompt: string
  kind: "text" | "single" | "multiple"
  options: { id: string; label: string }[]
  required: boolean
}
export type InputAnswer = {
  answers?: Record<string, string | string[]>
  secret?: string
  cancelled?: boolean
}
export type InputRequest = {
  request_id: string
  kind: "questions" | "secret"
  status: "pending" | "answered" | "cancelled"
  title: string | null
  questions: InputQuestion[]
  tool_call_id: string | null
  expires_at?: number
  secret?: { label: string; purpose: string }
}

export function inputQuestionComplete(
  question: InputQuestion,
  response: InputAnswer
) {
  if (!question.required) return true
  const answer = response.answers?.[question.id]
  return Boolean(Array.isArray(answer) ? answer.length : answer?.trim())
}
