export type AssistantSortType = "comprehensive" | "hottest" | "newest"

export type AssistantItem = {
  id: number
  name: string
  description: string | null
  category: string | null
  prompt?: string | null
  starters?: string[] | null
  sort: number
  usage_count: number
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

export type AssistantCategoryItem = {
  code: string
  name: string
  sort: number
}

export type AssistantWriteBody = {
  name: string
  prompt: string
  description?: string | null
  category?: string | null
  starters?: string[]
  sort?: number
}
