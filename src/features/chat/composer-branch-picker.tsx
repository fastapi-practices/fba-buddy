import { useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  PlusIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useT } from "@/hooks/use-t"

function CreateBranchDialog({
  open,
  name,
  disabled,
  onName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  name: string
  disabled: boolean
  onName: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const t = useT()
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!disabled) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.gitCreateBranch")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() && !disabled) onSubmit()
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="composer-branch-name">
                {t("common.gitBranchName")}
              </FieldLabel>
              <Input
                id="composer-branch-name"
                autoFocus
                value={name}
                disabled={disabled}
                placeholder="feature/my-task"
                onChange={(event) => onName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={disabled || !name.trim()}>
              {t("common.gitCreateBranch")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ComposerBranchPicker({
  branch,
  branches,
  pendingWorktree,
  disabled,
  onOpen,
  onSelect,
  submenu,
}: {
  branch: string | null
  branches: string[]
  pendingWorktree: boolean
  disabled: boolean
  onOpen: () => void
  onSelect: (branch: string, create?: boolean) => Promise<boolean>
  submenu: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const Root = submenu ? DropdownMenuSub : Popover
  const Trigger = submenu ? DropdownMenuSubTrigger : PopoverTrigger
  const Content = submenu ? DropdownMenuSubContent : PopoverContent
  return (
    <>
      <Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            setQuery("")
            onOpen()
          }
        }}
      >
        <Trigger
          disabled={disabled}
          aria-label={`${t(pendingWorktree ? "common.worktreeBaseBranch" : "common.gitBranch")}: ${branch ?? "Detached HEAD"}`}
          render={
            submenu ? undefined : (
              <Button
                variant="ghost"
                size="sm"
                className="max-w-48 min-w-0 rounded-full"
              />
            )
          }
        >
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">
            {pendingWorktree && branch
              ? t("common.worktreeFromBranch", { branch })
              : (branch ?? "Detached HEAD")}
          </span>
          {!submenu ? <ChevronDownIcon data-icon="inline-end" /> : null}
        </Trigger>
        <Content
          align="start"
          side={submenu ? "right" : "top"}
          className="w-72 p-0"
        >
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("common.gitSearchBranches")}
            />
            <CommandList>
              <CommandEmpty>{t("common.gitNoBranches")}</CommandEmpty>
              <CommandGroup
                heading={t(
                  pendingWorktree
                    ? "common.worktreeBaseBranch"
                    : "common.gitChooseBranch"
                )}
              >
                {branches.map((item) => (
                  <CommandItem
                    key={item}
                    value={item}
                    onSelect={() => {
                      setOpen(false)
                      void onSelect(item)
                    }}
                  >
                    <GitBranchIcon />
                    <span className="min-w-0 flex-1 truncate">{item}</span>
                    {item === branch && <CheckIcon />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {!pendingWorktree && (
              <div className="p-1">
                <Separator className="mb-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setName(query.trim())
                    setOpen(false)
                    setCreating(true)
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("common.gitCreateBranch")}
                </Button>
              </div>
            )}
          </Command>
        </Content>
      </Root>
      <CreateBranchDialog
        open={creating}
        name={name}
        disabled={disabled}
        onName={setName}
        onOpenChange={setCreating}
        onSubmit={() => {
          void onSelect(name.trim(), true).then((done) => {
            if (done) setCreating(false)
          })
        }}
      />
    </>
  )
}
