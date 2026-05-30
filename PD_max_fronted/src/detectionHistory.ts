import type {
  DetectionHistoryApiRecord,
  RuleChecksData,
  RuleChecksPixelOverlap,
  RuleChecksTimestamp,
  V3ResultItem,
} from './api/detect'

export type HistoryPayload = {
  result?: V3ResultItem | null
  multi?: V3ResultItem[]
  error_msg?: string | null
}

export type DetectionHistoryEntry = {
  id: string
  savedAt: string
  taskId: string
  fileName: string
  imageUrl: string
  payload: HistoryPayload
  status: 'COMPLETED' | 'FAILED'
  mode?: string
  /** 规则检测（辅助核查）结果，可与 AI 检测同 task 关联 */
  ruleCheck?: RuleChecksData | null
}

const RULE_HISTORY_MODES = new Set([
  'rule_checks',
  'rule_pixel_overlap',
  'rule_timestamp',
])

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isRuleHistoryMode(mode: string | undefined): boolean {
  return RULE_HISTORY_MODES.has(String(mode ?? '').trim().toLowerCase())
}

/** 侧边栏仅展示 AI 主检测记录，规则记录按 task_id 合并到对应条目 */
export function isPrimaryHistoryMode(mode: string | undefined): boolean {
  return !isRuleHistoryMode(mode)
}

function extractRuleCheckFromObject(obj: Record<string, unknown>): RuleChecksData {
  const pixel = obj.pixel_overlap
  const ts = obj.timestamp
  return {
    pixel_overlap:
      pixel === null || pixel === undefined
        ? null
        : isRecord(pixel)
          ? (pixel as RuleChecksPixelOverlap)
          : null,
    timestamp: isRecord(ts) ? (ts as RuleChecksTimestamp) : undefined,
    hard_tamper_flags: isRecord(obj.hard_tamper_flags)
      ? (obj.hard_tamper_flags as Record<string, boolean>)
      : undefined,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
  }
}

/** 从 rule_* 模式的历史 outcome 解析 */
export function ruleChecksFromHistoryRecord(r: DetectionHistoryApiRecord): RuleChecksData | null {
  const mode = String(r.mode ?? '').trim().toLowerCase()
  const oc = r.outcome
  if (!isRecord(oc)) return null

  if (mode === 'rule_checks') {
    return extractRuleCheckFromObject(oc)
  }
  if (mode === 'rule_pixel_overlap') {
    return {
      pixel_overlap: oc as RuleChecksPixelOverlap,
      reason: typeof oc.reason === 'string' ? oc.reason : undefined,
    }
  }
  if (mode === 'rule_timestamp') {
    return {
      timestamp: oc as RuleChecksTimestamp,
      reason: typeof oc.reason === 'string' ? oc.reason : undefined,
    }
  }

  if (isRecord(oc.rule_checks)) {
    return extractRuleCheckFromObject(oc.rule_checks)
  }
  if (oc.pixel_overlap != null || oc.timestamp != null) {
    return extractRuleCheckFromObject(oc)
  }
  return null
}

/** AI 结果里附带的 timestamp_check / pixel_overlap_score 等，转为辅助核查展示 */
export function ruleChecksFromV3Result(item: V3ResultItem | null | undefined): RuleChecksData | null {
  if (!item) return null
  const tc = item.timestamp_check
  const score = item.pixel_overlap_score
  const flags = item.hard_tamper_flags
  const hasFlags =
    flags != null &&
    typeof flags === 'object' &&
    !Array.isArray(flags) &&
    Object.keys(flags as object).length > 0
  if (!tc && score == null && !hasFlags) return null

  const flagObj =
    flags != null && typeof flags === 'object' && !Array.isArray(flags)
      ? (flags as Record<string, boolean>)
      : undefined

  const reasonParts: string[] = []
  const fullReason = String(item.reason ?? '')
  if (fullReason.includes('像素重叠') || fullReason.includes('拼接')) {
    for (const part of fullReason.split('；')) {
      if (part.includes('像素') || part.includes('拼接')) reasonParts.push(part.trim())
    }
  }

  const pixel: RuleChecksPixelOverlap | null =
    score != null && Number.isFinite(Number(score))
      ? {
          pixel_overlap_score: Number(score),
          alert: Number(score) >= 0.55,
          hard_tamper: flagObj?.pixel_overlap === true,
          reasons: reasonParts.length ? reasonParts : undefined,
        }
      : null

  const timestamp: RuleChecksTimestamp | undefined = tc
    ? {
        timestamp_check: tc as RuleChecksTimestamp['timestamp_check'],
        hard_tamper: flagObj?.timestamp === true,
        business_mismatch:
          tc.business_mismatch === true ||
          (Array.isArray(tc.anomalies) && tc.anomalies.length > 0),
        anomalies: Array.isArray(tc.anomalies) ? tc.anomalies.map(String) : [],
        reasons: [],
      }
    : undefined

  const summaryParts = [...reasonParts]
  if (timestamp?.business_mismatch) {
    summaryParts.push('时间与单据信息存在不一致')
  }

  return {
    pixel_overlap: pixel,
    timestamp,
    hard_tamper_flags: flagObj,
    reason: summaryParts.length ? summaryParts.join('；') : undefined,
  }
}

export function mapApiRecordToEntry(r: DetectionHistoryApiRecord): DetectionHistoryEntry {
  const oc = r.outcome ?? {}
  const payload: HistoryPayload = {
    result: oc.result ?? null,
    multi: oc.multi_results,
    error_msg: oc.error_msg ?? null,
  }
  const name = r.original_filename?.trim()
  const ruleFromRecord = ruleChecksFromHistoryRecord(r)
  const ruleFromAi = ruleChecksFromV3Result(payload.result)

  return {
    id: String(r.id),
    savedAt: r.created_at,
    taskId: (r.task_id ?? '').trim(),
    fileName: name || '未命名图片',
    imageUrl: (r.image_url ?? '').trim(),
    payload,
    status: r.status?.toUpperCase() === 'FAILED' ? 'FAILED' : 'COMPLETED',
    mode: r.mode,
    ruleCheck: ruleFromRecord ?? ruleFromAi ?? null,
  }
}

/** 将同页内的 rule_* 记录合并到对应 AI 检测条目 */
export function mergeHistoryEntriesForDisplay(
  items: DetectionHistoryApiRecord[],
): DetectionHistoryEntry[] {
  const all = items.map(mapApiRecordToEntry)
  const ruleByTask = new Map<string, RuleChecksData>()

  for (const e of all) {
    if (e.ruleCheck && e.taskId && isRuleHistoryMode(e.mode)) {
      ruleByTask.set(e.taskId, e.ruleCheck)
    }
  }

  const primary = all.filter((e) => isPrimaryHistoryMode(e.mode))
  for (const e of primary) {
    if (!e.ruleCheck && e.taskId && ruleByTask.has(e.taskId)) {
      e.ruleCheck = ruleByTask.get(e.taskId)!
    }
    if (!e.ruleCheck && e.payload.result) {
      e.ruleCheck = ruleChecksFromV3Result(e.payload.result)
    }
  }
  return primary
}
