import { useAgentMode } from "@/features/chat/conversation-mode"
import { BuddyLogo } from "@/features/shell/BuddyLogo"
import { useT } from "@/hooks/use-t"

export function ChatWelcome() {
  const t = useT()
  const mode = useAgentMode()

  return (
    <div className="thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      {mode === "coding" ? <BuddyLogo className="mb-4 size-10" /> : null}
      <h1 className="thread-welcome-message-inner animate-in text-3xl font-medium tracking-tight duration-200 fill-mode-both fade-in slide-in-from-bottom-1">
        {t(
          mode === "chat"
            ? "common.chatWelcome"
            : mode === "work"
              ? "common.workWelcome"
              : "common.fbabuddyIVeGotYou"
        )}
      </h1>
    </div>
  )
}
