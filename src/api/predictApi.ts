/**
 * AI 智能预测 v2 — /predict/results 已落库预测结果。
 * 替代旧版规则预测 /forecast/* 管线。
 */
import axios from 'axios'
import { ApiPaths } from './paths'
import { pickStr, pickNum } from '../utils/apiFieldPick'

// ─── 类型 ────────────────────────────────────────────────

/** v2 预测结果明细行 */
export interface PredictResultRow {
  targetDate: string
  regionalManager: string
  smelter: string | null
  warehouse: string
  productVariety: string
  expectedShipment: number
  analysis: string | null
  shipProbability: string
  expectedShipDate: string | null
  confidenceLevel: string
  mainFactors: string
  comprehensiveAnalysis: string
  historyAnalysis: string
  priceSensitivityAnalysis: string
  priceCompetitivenessAnalysis: string
  holidayAnalysis: string
  weatherAnalysis: string
  raw: Record<string, unknown>
}

/** 客户端聚合图表数据（替代 /forecast/chart） */
export interface PredictChartAggregate {
  dates: string[]
  totalByDate: number[]
}

// ─── 工具 ────────────────────────────────────────────────

function pickStrOrNull(row: Record<string, unknown>, keys: string[]): string | null {
  const s = pickStr(row, keys)
  return s || null
}

/** 统一为 YYYY-MM-DD，折线图横轴与透视表单元格才能对齐 */
export function normalizePredictDate(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = new Date(t.includes('T') ? t : `${t}T00:00:00`)
  if (Number.isNaN(d.getTime())) return t.slice(0, 10)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

// ─── Normalize ───────────────────────────────────────────

/** 将单条原始响应行解析为 PredictResultRow */
export function normalizePredictResultRow(raw: unknown): PredictResultRow | null {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const targetDateRaw = pickStr(r, ['target_date', 'targetDate', '预测日期', 'date'])
  const targetDate = normalizePredictDate(targetDateRaw)
  if (!targetDate) return null

  const analysis = pickStr(r, ['analysis', 'Analysis']) || null
  return {
    targetDate,
    regionalManager: pickStr(r, ['regional_manager', 'regionalManager', '大区经理', '经理']) || '—',
    smelter: pickStrOrNull(r, ['smelter', '冶炼厂', 'smelter_name', '冶炼厂名']),
    warehouse: pickStr(r, ['warehouse', '仓库', 'warehouse_name', '仓库名']) || '—',
    productVariety: pickStr(r, ['product_variety', 'productVariety', '品类', '品种', '产品品种']) || '—',
    expectedShipment: pickNum(r, ['expected_shipment', 'expectedShipment', 'predicted_weight', 'predictedWeight', '预测重量', 'weight']) ?? 0,
    analysis,
    shipProbability: pickStr(r, ['ship_probability', 'shipProbability']),
    expectedShipDate: pickStrOrNull(r, ['expected_ship_date', 'expectedShipDate']),
    confidenceLevel: pickStr(r, ['confidence_level', 'confidenceLevel']),
    mainFactors: pickStr(r, ['main_factors', 'mainFactors']) || analysis || '',
    comprehensiveAnalysis: pickStr(r, ['comprehensive_analysis', 'comprehensiveAnalysis']) || analysis || '',
    historyAnalysis: pickStr(r, ['history_analysis', 'historyAnalysis']),
    priceSensitivityAnalysis: pickStr(r, ['price_sensitivity_analysis', 'priceSensitivityAnalysis']),
    priceCompetitivenessAnalysis: pickStr(r, ['price_competitiveness_analysis', 'priceCompetitivenessAnalysis']),
    holidayAnalysis: pickStr(r, ['holiday_analysis', 'holidayAnalysis']),
    weatherAnalysis: pickStr(r, ['weather_analysis', 'weatherAnalysis']),
    raw: r,
  }
}

/** 批量解析，按 (targetDate, warehouse, productVariety, smelter) 去重，保留最后出现的行 */
export function normalizePredictResultList(items: unknown[]): PredictResultRow[] {
  const dedup = new Map<string, PredictResultRow>()
  for (const raw of items) {
    const row = normalizePredictResultRow(raw)
    if (!row) continue
    const key = `${row.targetDate}|${row.warehouse}|${row.productVariety}|${row.smelter ?? ''}`
    dedup.set(key, row)
  }
  return [...dedup.values()]
}

// ─── Trigger Prediction ──────────────────────────────────

/** 触发预测的请求参数 */
export interface TriggerPredictionParams {
  warehouse: string
  productVariety?: string
  smelter?: string
  startDate?: string
  endDate?: string
}

function isPredictDailyItem(it: unknown): boolean {
  if (!it || typeof it !== 'object') return false
  const r = it as Record<string, unknown>
  return !!normalizePredictDate(pickStr(r, ['target_date', 'targetDate', '预测日期', 'date']))
}

/** 将 POST /predict 响应（按仓库块 + items[]）展平为明细行 */
function flattenPredictPostResponseBody(body: unknown): unknown[] {
  const flat: unknown[] = []
  let blocks: unknown[] = []
  if (Array.isArray(body)) {
    blocks = body
  } else if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const nestedItems = o.items
    if (Array.isArray(nestedItems) && pickStr(o, ['warehouse', '仓库', 'warehouse_name'])) {
      // 单仓库块：顶层 warehouse + items 为按日预测行
      blocks = [body]
    } else if (Array.isArray(nestedItems) && nestedItems.length > 0) {
      const first = nestedItems[0]
      if (first && typeof first === 'object' && Array.isArray((first as Record<string, unknown>).items)) {
        blocks = nestedItems
      } else if (isPredictDailyItem(first)) {
        blocks = [body]
      }
    } else if (Array.isArray(o.results)) {
      blocks = o.results
    } else if (Array.isArray(o.data)) {
      blocks = o.data
    } else if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      blocks = [o.data]
    }
  }

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    const wh = pickStr(b, ['warehouse', '仓库', 'warehouse_name'])
    const parentReport = pickStr(b, ['analysis_report', 'analysisReport', 'comprehensive_analysis'])
    const nested = b.items
    if (!Array.isArray(nested)) continue
    for (const it of nested) {
      if (!it || typeof it !== 'object') continue
      const row: Record<string, unknown> = { ...(it as Record<string, unknown>) }
      if (wh) row.warehouse = wh
      if (parentReport && !pickStr(row, ['comprehensive_analysis', 'comprehensiveAnalysis', 'analysis'])) {
        row.comprehensive_analysis = parentReport
      }
      flat.push(row)
    }
  }
  return flat
}

/**
 * 调用 POST /predict，并用**本次响应**解析为明细行（折线/透视表数据源）。
 * 结果仍会落库；预测依据文案请仍从 GET /predict/results 读取。
 */
export async function fetchPredictRowsFromPost(params: TriggerPredictionParams): Promise<PredictResultRow[]> {
  const item: Record<string, unknown> = {
    warehouse: params.warehouse,
  }
  if (params.productVariety) item.product_variety = params.productVariety
  if (params.smelter) item.smelter = params.smelter
  if (params.startDate) item.prediction_start_date = params.startDate

  const response = await axios.post(ApiPaths.predict, { items: [item] }, { timeout: 300000 })
  const flat = flattenPredictPostResponseBody(response.data)
  const rows = normalizePredictResultList(flat)
  if (!params.smelter) return rows
  return rows.map((row) =>
    row.smelter?.trim() ? row : { ...row, smelter: params.smelter ?? null },
  )
}

/** @deprecated 请使用 fetchPredictRowsFromPost */
export async function triggerPrediction(params: TriggerPredictionParams): Promise<void> {
  await fetchPredictRowsFromPost(params)
}

// ─── Fetch ───────────────────────────────────────────────

/** 筛选参数：与 buildForecastFilterParams() 输出一致 */
export type PredictFilterParams = Record<string, string | number | string[] | undefined>

/**
 * 分页拉取 /predict/results 所有结果。
 * page_size 固定 200（v2 后端上限）。
 */
export async function fetchAllPredictResults(
  base: PredictFilterParams,
): Promise<PredictResultRow[]> {
  const page_size = 200
  const rawItems: unknown[] = []
  let page = 1
  while (page <= 200) {
    // _t 防止浏览器/代理缓存 GET 响应，避免取到 comprehensiveAnalysis 尚未落库的历史数据
    const params: Record<string, unknown> = { ...base, page, page_size, _t: Date.now() }
    const response = await axios.get(ApiPaths.predictResults, { params })
    const data = response.data as { items?: unknown[]; total?: number }
    const items = data.items ?? []
    rawItems.push(...items)
    if (items.length === 0) break
    if (items.length < page_size) break
    if (typeof data.total === 'number' && rawItems.length >= data.total) break
    page++
  }
  return normalizePredictResultList(rawItems)
}

// ─── Aggregate ───────────────────────────────────────────

/** 本地日历「今天」YYYY-MM-DD（避免 toISOString 用 UTC 导致东八区日期错位） */
export function localTodayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function enumerateDatesInclusive(from: string, to: string): string[] {
  const out: string[] = []
  const cur = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) return out
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const day = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export interface ForecastDateRangeOptions {
  dateFrom?: string
  dateTo?: string
}

/**
 * 与筛选「送货日期」一致的横轴：优先 date_from～date_to，且起始不早于本地今天。
 * 折线图与透视表共用，避免两控件日期列不一致。
 */
export function resolveForecastDateAxis(
  rows: PredictResultRow[],
  options?: ForecastDateRangeOptions,
): string[] {
  const today = localTodayYmd()
  const fromRaw = options?.dateFrom?.trim()
  const toRaw = options?.dateTo?.trim()
  if (fromRaw && toRaw) {
    const from = fromRaw < today ? today : fromRaw
    const to = toRaw < from ? from : toRaw
    const axis = enumerateDatesInclusive(from, to)
    if (axis.length > 0) return axis
  }
  const byDate = sumExpectedShipmentByDate(rows)
  if (byDate.size > 0) {
    return [...byDate.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }
  return []
}

/** 按 targetDate 汇总 expectedShipment（仅今天及以后） */
export function sumExpectedShipmentByDate(rows: PredictResultRow[]): Map<string, number> {
  const today = localTodayYmd()
  const byDate = new Map<string, number>()
  for (const row of rows) {
    const d = row.targetDate
    if (!d || d < today) continue
    byDate.set(d, (byDate.get(d) || 0) + row.expectedShipment)
  }
  return byDate
}

/**
 * 客户端图表聚合：与透视表同一套日期轴与按日求和。
 * 替代旧的 /forecast/chart 接口。
 */
export function aggregateChartFromResults(
  rows: PredictResultRow[],
  options?: ForecastDateRangeOptions,
): PredictChartAggregate {
  const dates = resolveForecastDateAxis(rows, options)
  const byDate = sumExpectedShipmentByDate(rows)
  return {
    dates,
    totalByDate: dates.map((d) => byDate.get(d) ?? 0),
  }
}
