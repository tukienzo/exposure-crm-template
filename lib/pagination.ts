export type Pagination = {
  page: number
  pageSize: number
  from: number
  to: number
}

export function parsePagination(params: URLSearchParams, defaults = { pageSize: 100, maxPageSize: 250 }): Pagination | null {
  if (!params.has("page") && !params.has("pageSize")) return null
  const rawPage = Number(params.get("page") || 1)
  const rawPageSize = Number(params.get("pageSize") || defaults.pageSize)
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0
    ? Math.min(rawPageSize, defaults.maxPageSize)
    : defaults.pageSize
  const from = (page - 1) * pageSize
  return { page, pageSize, from, to: from + pageSize - 1 }
}

export function paginatedPayload<T>(data: T[], total: number, pagination: Pagination) {
  return {
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      hasNext: pagination.to + 1 < total,
    },
  }
}
