import { SearchIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

export function PickerSearch({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="p-1" onPointerDown={(event) => event.stopPropagation()}>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") event.stopPropagation()
          }}
        />
      </InputGroup>
    </div>
  )
}
