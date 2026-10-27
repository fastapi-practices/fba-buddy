import { useContext, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  useChatMessage,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipIconButton } from "./tooltip-icon-button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import { useT } from "@/hooks/use-t"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import {
  collectInputRequests,
  mergeInputRequestLists,
  messageInputRequests,
  pendingInputRequests as pendingInputRequestList,
} from "@/features/chat/input-requests"
import {
  inputQuestionComplete,
  type InputQuestion,
} from "@/shared/chat-input"
import { answerInputRequest, type InputRequest } from "@/api/chat-interactions"
import { useConversationAuxiliary } from "@/features/chat/conversation-auxiliary-context"
import { TurnContentContext } from "./transcript"

function InputRequestPanel({
  request,
  conversationId,
  onResolved,
}: {
  request: InputRequest
  conversationId: string
  onResolved?: (status: "answered" | "cancelled") => void
}) {
  const t = useT()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [secret, setSecret] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!request.expires_at) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [request.expires_at])
  const expired =
    !!request.expires_at && request.expires_at * 1000 <= now
  const question = request.questions[step]
  const progressLabel = t("common.questionProgress", {
    current: step + 1,
    total: request.questions.length,
  })
  const disabled = expired || submitting
  const itemDefinitions = useMemo(
    () =>
      request.questions.map((item) => ({
        name: item.id,
        disabled,
        required: item.required,
        choices: item.options.map((option) => ({
          value: option.id,
          disabled,
        })),
      })),
    [disabled, request.questions]
  )
  const complete = (item: InputQuestion) =>
    inputQuestionComplete(item, { answers })
  const valid =
    request.kind === "secret" ? !!secret : request.questions.every(complete)
  const submit = async (cancelled = false) => {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      await answerInputRequest(
        conversationId,
        request.request_id,
        cancelled
          ? { cancelled: true }
          : request.kind === "secret"
            ? { secret }
            : { answers }
      )
      setSecret("")
      onResolved?.(cancelled ? "cancelled" : "answered")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }
  const select = (item: InputQuestion, id: string, checked: boolean) => {
    if (disabled) return
    setAnswers((current) => {
      if (item.kind !== "multiple") {
        return { ...current, [item.id]: id }
      }
      const selected = Array.isArray(current[item.id])
        ? (current[item.id] as string[])
        : []
      return {
        ...current,
        [item.id]: checked
          ? selected.includes(id)
            ? selected
            : [...selected, id]
          : selected.filter((value) => value !== id),
      }
    })
  }
  const clearQuestion = (id: string) => {
    setAnswers((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }
  const changeItem = (name: string) => {
    const index = request.questions.findIndex((item) => item.id === name)
    if (index >= 0) setStep(index)
  }
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || !valid) return
    void submit()
  }
  return (
    <section
      data-slot="input-request"
      className="w-full min-w-0 rounded-xl border bg-background p-4"
      aria-label={request.title ?? request.request_id}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <strong>{request.title}</strong>
        <div className="flex items-center gap-1">
          <span
            role="status"
            data-slot="input-request-status"
            className="text-xs text-muted-foreground"
          >
            {t(
              expired
                ? "common.requestExpired"
                : submitting
                  ? "common.submitting"
                  : "common.waitingForAnswer"
            )}
          </span>
          {!expired && (
            <TooltipIconButton
              type="button"
              tooltip={t("common.cancelInputRequest")}
              disabled={submitting}
              onClick={() => void submit(true)}
              className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </TooltipIconButton>
          )}
        </div>
      </div>
      {request.status === "pending" ? (
        <>
          {request.kind === "secret" ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (disabled || !valid) return
                void submit()
              }}
            >
              <Field>
                <FieldLabel htmlFor={`secret-${request.request_id}`}>
                  {request.secret?.label}
                </FieldLabel>
                <FieldDescription>{request.secret?.purpose}</FieldDescription>
                <Input
                  id={`secret-${request.request_id}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  disabled={disabled}
                  onChange={(event) => setSecret(event.target.value)}
                />
                <FieldDescription>
                  {t("common.secretRequestHint")}
                </FieldDescription>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={disabled || !valid}>
                  {t("common.submit")}
                </Button>
              </div>
            </form>
          ) : (
            <Questionnaire
              className="min-w-0"
              items={itemDefinitions}
              item={question?.id}
              onItemChange={changeItem}
              shortcuts="numbers"
              onSubmit={handleSubmit}
            >
              <QuestionnaireProgress aria-valuetext={progressLabel}>
                {progressLabel}
              </QuestionnaireProgress>
              {request.questions.map((item) => {
                const answer = answers[item.id]
                const selected = Array.isArray(answer)
                  ? answer
                  : answer
                    ? [answer]
                    : []
                return (
                  <QuestionnaireItem
                    key={item.id}
                    name={item.id}
                    multiple={item.kind === "multiple"}
                    required={item.required}
                    disabled={disabled}
                  >
                    <QuestionnaireTitle>{item.prompt}</QuestionnaireTitle>
                    <QuestionnaireChoices>
                      {item.options.map((option) => (
                        <QuestionnaireChoice
                          key={option.id}
                          value={option.id}
                          checked={selected.includes(option.id)}
                          disabled={disabled}
                          onChange={(event) =>
                            select(item, option.id, event.target.checked)
                          }
                        >
                          <span className="font-medium">{option.label}</span>
                        </QuestionnaireChoice>
                      ))}
                      {item.kind === "text" && (
                        <QuestionnaireInput
                          aria-label={item.prompt}
                          placeholder={t("common.customAnswer")}
                          value={String(answer ?? "")}
                          disabled={disabled}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </QuestionnaireChoices>
                    <QuestionnaireError>
                      {item.required
                        ? t("common.answerRequired")
                        : t("common.answerOptional")}
                    </QuestionnaireError>
                  </QuestionnaireItem>
                )
              })}
              <QuestionnaireActions>
                <QuestionnairePrevious disabled={submitting}>
                  {t("common.previousStep")}
                </QuestionnairePrevious>
                <QuestionnaireSkip
                  disabled={submitting}
                  onClick={() => question && clearQuestion(question.id)}
                >
                  {t("common.skip")}
                </QuestionnaireSkip>
                <QuestionnaireNext disabled={submitting}>
                  {t("common.nextStep")}
                </QuestionnaireNext>
                <QuestionnaireSubmit disabled={disabled || !valid}>
                  {t("common.submit")}
                </QuestionnaireSubmit>
              </QuestionnaireActions>
            </Questionnaire>
          )}
        </>
      ) : null}
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
/**
 * 正文里的提问卡片：提问和回答都渲染在发起提问的那条消息上
 */
export function MessageInputRequests() {
  const { conversationId } = useContext(WorkspaceActionsContext)
  const message = useChatMessage()
  const { mode, finalId } = useContext(TurnContentContext)
  const [resolved, setResolved] = useState<string[]>([])
  const requests = useMemo(() => messageInputRequests(message), [message])
  const visible = useMemo(() => {
    if (mode === "approval" || mode === "approval-denied") return []
    // 最终答复里的提问卡片渲染在气泡中，执行过程里不再重复
    if (mode === "work" && message.id === finalId) return []
    // 回答之后不再保留提问卡片
    return requests.filter(
      (request) =>
        request.status === "pending" && !resolved.includes(request.request_id)
    )
  }, [mode, finalId, message.id, requests, resolved])
  if (!conversationId || !visible.length) return null
  return (
    <div
      data-slot="message-input-requests"
      className="mt-2 flex min-w-0 flex-col gap-3"
    >
      {visible.map((request) => (
        <InputRequestPanel
          key={request.request_id}
          request={request}
          conversationId={conversationId}
          onResolved={() =>
            setResolved((current) => [...current, request.request_id])
          }
        />
      ))}
    </div>
  )
}

/**
 * 兜底展示：服务端还有待回答的请求，但对话正文里没有对应消息
 */
export function PendingInputRequests() {
  const { conversationId } = useContext(WorkspaceActionsContext)
  const messages = useChatRuntimeState((s) => s.thread.messages)
  const { pendingInputRequests: stored, removePendingInputRequest } =
    useConversationAuxiliary()
  const [resolved, setResolved] = useState<string[]>([])
  const anchored = useMemo(() => collectInputRequests(messages), [messages])
  const requests = useMemo(() => {
    const anchoredIds = new Set(anchored.map((item) => item.request.request_id))
    return pendingInputRequestList(
      mergeInputRequestLists(stored, anchored)
    ).filter(
      (request) =>
        !anchoredIds.has(request.request_id) &&
        !resolved.includes(request.request_id)
    )
  }, [stored, anchored, resolved])
  if (!conversationId || !requests.length) return null
  return (
    <div
      data-slot="pending-input-requests"
      className="mb-3 flex w-full min-w-0 flex-col gap-3"
    >
      {requests.map((request) => (
        <InputRequestPanel
          key={request.request_id}
          request={request}
          conversationId={conversationId}
          onResolved={() => {
            setResolved((current) => [...current, request.request_id])
            removePendingInputRequest(request.request_id)
          }}
        />
      ))}
    </div>
  )
}
