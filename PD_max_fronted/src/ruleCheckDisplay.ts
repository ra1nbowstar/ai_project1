import type { RuleChecksData, RuleChecksPixelOverlap, RuleChecksTimestamp } from './api/detect'

export type RuleCheckFindingStatus = 'ok' | 'warn' | 'bad'

export type RuleCheckUserFinding = {
  status: RuleCheckFindingStatus
  title: string
  text: string
}

export type RuleCheckTimeFact = {
  label: string
  value: string
}

export type RuleCheckUserView = {
  /** 一句话总述（优先用接口中文 reason，否则按结论生成） */
  summary: string
  findings: RuleCheckUserFinding[]
  /** 识别到的时间信息，便于用户自行比对 */
  timeFacts: RuleCheckTimeFact[]
}

const ANOMALY_ZH: Record<string, string> = {
  status_transaction_time_mismatch: '图片顶部状态栏时间与交易时间对不上',
  exif_visible_datetime_mismatch: '照片元数据中的时间与画面显示的交易时间相差较大',
  business_visible_datetime_mismatch: '您填写的单据时间与图片里显示的交易时间不一致',
  business_exif_datetime_mismatch: '您填写的单据时间与照片原始拍摄时间不一致',
  business_status_bar_time_mismatch: '您填写的单据时间与图片顶部状态栏时间不一致',
  business_visible_time_not_found: '已填写单据时间，但图片中未能识别到可比对的时间文字',
  transaction_time_unparsed: '图片里疑似有时间文字，但系统未能可靠识别',
  future_datetime: '图片中出现“未来时间”，不符合常理',
  exif_editing_software: '照片信息中带有修图软件痕迹',
}

function joinUnique(parts: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.join('；')
}

function anomalyTexts(codes: string[] | undefined): string[] {
  if (!codes?.length) return []
  return codes.map((c) => ANOMALY_ZH[c.trim()] ?? '').filter(Boolean)
}

export function ruleCheckVerdict(data: RuleChecksData | null | undefined): {
  label: string
  pillClass: string
} {
  if (!data) return { label: '—', pillClass: '' }
  const po = data.pixel_overlap
  const ts = data.timestamp
  if (po?.hard_tamper || ts?.hard_tamper) return { label: '篡改', pillClass: '篡改' }
  if (po?.alert || (ts?.risk ?? 0) >= 0.42) return { label: '可疑', pillClass: '可疑' }
  return { label: '正常', pillClass: '正常' }
}

function defaultSummary(data: RuleChecksData, label: string): string {
  const fromApi = data.reason?.trim()
  if (fromApi) return fromApi
  if (label === '篡改') return '发现较明确的异常信号，建议谨慎采信该图片，并结合原件人工复核。'
  if (label === '可疑') return '发现一些需留意的疑点，建议结合原件再核对。'
  return '未发现明显的拼接痕迹或时间矛盾。'
}

function pixelFinding(
  po: RuleChecksPixelOverlap | null | undefined,
  skipped: boolean,
): RuleCheckUserFinding {
  if (skipped) {
    return {
      status: 'ok',
      title: '拼接 / 贴图痕迹',
      text: '本次未指定关注区域，未做局部拼接检查。如需排查某一块是否被改过，可在左侧开启「仅分析框选区域」并框选后重新检测。',
    }
  }
  if (!po) {
    return {
      status: 'ok',
      title: '拼接 / 贴图痕迹',
      text: '未获取到该项结果。',
    }
  }
  const reasonText = joinUnique(po.reasons ?? [])
  if (po.hard_tamper) {
    return {
      status: 'bad',
      title: '拼接 / 贴图痕迹',
      text:
        reasonText ||
        '在所检查区域内，发现较明显的拼接或贴图痕迹，图片可信度较低，建议人工复核。',
    }
  }
  if (po.alert) {
    return {
      status: 'warn',
      title: '拼接 / 贴图痕迹',
      text:
        reasonText ||
        '在所检查区域内，可能存在拼接或贴图痕迹，建议结合原件人工再看一眼。',
    }
  }
  return {
    status: 'ok',
    title: '拼接 / 贴图痕迹',
    text: reasonText || '在所检查区域内，未发现明显的拼接或贴图痕迹。',
  }
}

function collectTimeFacts(ts: RuleChecksTimestamp | undefined): RuleCheckTimeFact[] {
  const tc = ts?.timestamp_check
  if (!tc) return []
  const facts: RuleCheckTimeFact[] = []
  if (tc.status_bar_time) {
    facts.push({ label: '图片顶部状态栏时间', value: String(tc.status_bar_time) })
  }
  const tx = tc.transaction_datetime || tc.transaction_time
  if (tx) facts.push({ label: '图片中的交易时间', value: String(tx) })
  const doc = tc.business_document_datetime || tc.business_document_time
  if (doc) facts.push({ label: '您填写的单据时间', value: String(doc) })
  if (tc.exif_datetime_original) {
    facts.push({ label: '照片原始拍摄时间', value: String(tc.exif_datetime_original) })
  }
  if (tc.exif_software) {
    facts.push({ label: '照片编辑软件信息', value: String(tc.exif_software) })
  }
  return facts
}

function timestampFinding(ts: RuleChecksTimestamp | undefined): RuleCheckUserFinding {
  if (!ts) {
    return {
      status: 'ok',
      title: '时间与单据核对',
      text: '未获取到该项结果。',
    }
  }
  const reasonParts = [
    ...(ts.reasons ?? []),
    ...anomalyTexts(ts.anomalies),
    ...anomalyTexts(ts.timestamp_check?.anomalies),
  ]
  const reasonText = joinUnique(reasonParts)

  if (ts.hard_tamper) {
    return {
      status: 'bad',
      title: '时间与单据核对',
      text:
        reasonText ||
        '图片中的时间与单据信息存在明显矛盾，或出现修图、未来时间等高风险信号，请重点人工核查。',
    }
  }
  if (ts.business_mismatch || (ts.risk ?? 0) >= 0.42 || reasonText) {
    return {
      status: 'warn',
      title: '时间与单据核对',
      text:
        reasonText ||
        '图片显示的时间与您填写的单据时间不完全一致，请确认是否为同一张回单、同一笔交易。',
    }
  }
  return {
    status: 'ok',
    title: '时间与单据核对',
    text: reasonText || '图片中的时间与单据信息未发现明显矛盾。',
  }
}

export function buildRuleCheckUserView(
  data: RuleChecksData | null | undefined,
): RuleCheckUserView | null {
  if (!data) return null
  const { label } = ruleCheckVerdict(data)
  const pixelSkipped = data.pixel_overlap == null && !!data.timestamp
  const findings: RuleCheckUserFinding[] = [
    pixelFinding(data.pixel_overlap, pixelSkipped),
    timestampFinding(data.timestamp),
  ]
  return {
    summary: defaultSummary(data, label),
    findings,
    timeFacts: collectTimeFacts(data.timestamp),
  }
}
