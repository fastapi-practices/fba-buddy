export type ApiResponse<T> = {
  code: number
  msg: string
  data: T
}

export type CursorPage<T> = {
  items: T[]
  next_cursor?: string | null
  has_more?: boolean
}
