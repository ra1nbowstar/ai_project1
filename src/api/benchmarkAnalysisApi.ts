import { fetchJson } from './userApi'
import { getToken } from './authApi'

export interface BenchmarkAnalysisRow {
  id: number
  province: string
  city: string
  warehouse: string
  benchmark_city: string
  benchmark_price: number
  benchmark_diff: number
  calibrated_price: number
  freight: number
  margin_config: number
  margin_calculated: number
  price: number
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

const BASE = '/tl/ai_pricing_analysis'

function readMsg(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  if (typeof o.message === 'string') return o.message
  if (typeof o.detail === 'string') return o.detail
  return ''
}

function pickRow(r: Record<string, unknown>, idx: number): BenchmarkAnalysisRow {
  return {
    id: Number(r.id ?? idx),
    province: String(r.province ?? ''),
    city: String(r.city ?? ''),
    warehouse: String(r.warehouse ?? ''),
    benchmark_city: String(r.benchmark_city ?? ''),
    benchmark_price: Number(r.benchmark_price ?? 0),
    benchmark_diff: Number(r.benchmark_diff ?? 0),
    calibrated_price: Number(r.calibrated_price ?? 0),
    freight: Number(r.freight ?? 0),
    margin_config: Number(r.margin_config ?? 0),
    margin_calculated: Number(r.margin_calculated ?? 0),
    price: Number(r.price ?? 0),
  }
}

export async function fetchBenchmarkAnalysis(params?: {
  province?: string
  city?: string
  page?: number
  page_size?: number
}): Promise<{ items: BenchmarkAnalysisRow[]; total: number }> {
  const q = new URLSearchParams()
  if (params?.province) q.set('province', params.province)
  q.set('page', String(params?.page ?? 1))
  q.set('page_size', String(params?.page_size ?? 20))

  const { res, data } = await fetchJson(`${BASE}?${q.toString()}`, {
    method: 'GET',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(readMsg(data) || `获取对标分析数据失败（HTTP ${res.status}）`)

  const payload = (data || {}) as Record<string, unknown>
  const inner = (payload.data ?? payload) as Record<string, unknown>
  const rawList =
    (Array.isArray(inner.list) ? inner.list : null) ??
    (Array.isArray(inner.items) ? inner.items : null) ??
    (Array.isArray(inner.records) ? inner.records : null) ??
    []
  const items = rawList
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r, i) => pickRow(r, i))

  const filtered = params?.city
    ? items.filter((r) => r.city.includes(params.city!))
    : items

  return {
    items: filtered,
    total: typeof inner.total === 'number' ? inner.total : items.length,
  }
}
