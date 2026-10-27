import { useQuery } from "@tanstack/react-query"
import {
  BotIcon,
  ImageIcon,
  MessageSquarePlusIcon,
  QuoteIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { listQuickPhrases } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useComposerStore } from "@/features/chat/composer-store"
import type { WorkspaceCommand } from "@/features/shell/workspace-commands"
import { useT } from "@/hooks/use-t"

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommand: (command: WorkspaceCommand) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onCommand,
}: CommandPaletteProps) {
  const t = useT()
  const insertPhrase = useComposerStore((state) => state.insertPhrase)
  const phrasesQuery = useQuery({
    queryKey: queryKeys.quickPhrases(),
    queryFn: listQuickPhrases,
  })
  const phrases = phrasesQuery.data ?? []

  function run(command: WorkspaceCommand) {
    onCommand(command)
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("common.commandPalette")}
      description={t("common.searchAndRunWorkspaceCommands")}
    >
      <Command>
        <CommandInput
          placeholder={t("common.searchCommandsSettingsOrPhrases")}
        />
        <CommandList>
          <CommandEmpty>{t("common.noMatchingCommands")}</CommandEmpty>
          <CommandGroup heading={t("common.workspace")}>
            <CommandItem
              value={`${t("common.newChat")} 新对话`}
              onSelect={() => run("new-conversation")}
            >
              <MessageSquarePlusIcon />
              {t("common.newChat")}
            </CommandItem>
            <CommandItem
              value={`${t("common.openSettings")} 打开设置`}
              onSelect={() => run("open-settings")}
            >
              <SettingsIcon />
              {t("common.openSettings")}
            </CommandItem>
            <CommandItem
              value={`${t("common.draw")} 绘画 会话/画图 图片生成`}
              onSelect={() => run("open-image")}
            >
              <ImageIcon />
              {t("common.draw")}
            </CommandItem>

            <CommandItem
              value={`${t("common.assistantsExperts")} 助手·专家 助手 专家 assistants experts`}
              onSelect={() => run("open-assistants")}
            >
              <BotIcon />
              {t("common.assistantsExperts")}
            </CommandItem>
          </CommandGroup>
          {phrases.length > 0 ? (
            <CommandGroup heading={t("commands.quickPhrases")}>
              {phrases.map((phrase) => (
                <CommandItem
                  key={phrase.id}
                  value={`${phrase.title} ${phrase.content}`}
                  onSelect={() => {
                    insertPhrase(phrase.content)
                    onOpenChange(false)
                  }}
                >
                  <QuoteIcon />
                  {phrase.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
