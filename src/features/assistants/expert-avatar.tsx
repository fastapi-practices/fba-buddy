import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { avatarFallbackTone } from "@/lib/avatar-tone"

export function ExpertAvatar({
  expert,
  className,
}: {
  expert: { id: number; name: string }
  className?: string
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback className={avatarFallbackTone(expert.id)}>
        {expert.name.trim().slice(0, 1) || "?"}
      </AvatarFallback>
    </Avatar>
  )
}
