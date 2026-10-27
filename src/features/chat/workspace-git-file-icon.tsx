import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCode2Icon,
  FileCogIcon,
  FileImageIcon,
  FileJsonIcon,
  FileKey2Icon,
  FileTextIcon,
  FileVideoIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export function WorkspaceGitFileIcon({
  path,
  className,
}: {
  path: string
  className?: string
}) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? ""
  const extension = name.split(".").at(-1) ?? ""
  const Icon = /^(png|jpe?g|gif|webp|svg|ico|avif|bmp)$/.test(extension)
    ? FileImageIcon
    : /^(mp3|wav|ogg|flac|m4a|aac)$/.test(extension)
      ? FileAudioIcon
      : /^(mp4|webm|mov|mkv|avi)$/.test(extension)
        ? FileVideoIcon
        : /^(zip|gz|tar|rar|7z|bz2|xz)$/.test(extension)
          ? FileArchiveIcon
          : /^(json|jsonc|jsonl)$/.test(extension)
            ? FileJsonIcon
            : /^(pem|key|crt|cer)$/.test(extension)
              ? FileKey2Icon
              : /^(ya?ml|toml|ini|conf|config|env)$/.test(extension) ||
                  /^(dockerfile|makefile|\.gitignore|\.gitattributes|\.editorconfig)$/.test(
                    name
                  )
                ? FileCogIcon
                : /^(tsx?|jsx?|vue|svelte|py|go|rs|java|c|h|cpp|hpp|cs|php|rb|swift|kt|sh|bash|zsh|html|css|scss|sql)$/.test(
                      extension
                    )
                  ? FileCode2Icon
                  : FileTextIcon

  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  )
}
