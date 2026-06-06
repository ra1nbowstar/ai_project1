#!/usr/bin/env node
/**
 * 前端修改验证脚本
 *
 * 验证:
 *   1. "图像" → "图片" 文案替换
 *   2. 默认只勾选"规则检测"（useModelDetection=false, useRuleDetection=true）
 *
 * 用法:
 *   node test_verify_changes.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_VUE = resolve(__dirname, 'PD_max_fronted/src/App.vue')

const src = readFileSync(APP_VUE, 'utf-8')

let passed = 0
let failed = 0

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label} — ${detail}`)
    failed++
  }
}

console.log('=' .repeat(50))
console.log('  验证 1: 文案替换（图像 → 图片）')
console.log('=' .repeat(50))

check(
  '标题 "图片真伪检测"',
  src.includes('图片真伪检测'),
  '未找到 "图片真伪检测"'
)
check(
  '副标题 "检测图片是否存在后期篡改风险"',
  src.includes('检测图片是否存在后期篡改风险'),
  '未找到 "检测图片是否存在后期篡改风险"'
)
check(
  '旧文案 "图像" 已全部替换',
  !src.includes('图像'),
  '仍存在 "图像" 文本，请手动检查'
)

console.log('')
console.log('=' .repeat(50))
console.log('  验证 2: 默认检测方式')
console.log('=' .repeat(50))

check(
  'useModelDetection = ref(false)',
  /const useModelDetection\s*=\s*ref\(false\)/.test(src),
  'useModelDetection 未设置为 false'
)
check(
  'useRuleDetection = ref(true)',
  /const useRuleDetection\s*=\s*ref\(true\)/.test(src),
  'useRuleDetection 未设置为 true'
)

// 验证默认组合逻辑：只勾选规则检测时应走 runRuleSingle / runRuleBatch 分支
const ruleOnlyBranch = src.includes(
  'if (useRuleDetection.value && !useModelDetection.value)'
)
check(
  '规则检测单独模式分支保留',
  ruleOnlyBranch,
  '规则检测单独模式的分支逻辑丢失'
)

console.log('')
console.log('=' .repeat(50))
console.log(`  结果: ${passed} 通过, ${failed} 失败`)
console.log('=' .repeat(50))

if (failed > 0) {
  console.log('\n⚠️  存在未通过的检查项，请修复后重试。')
  process.exit(1)
} else {
  console.log('\n✅ 所有检查通过！')
  console.log('')
  console.log('手动验证步骤:')
  console.log('  1. npm run dev')
  console.log('  2. 打开 http://localhost:5173')
  console.log('  3. 切换到"图片真伪检查"Tab')
  console.log('  4. 确认标题显示"图片真伪检测"')
  console.log('  5. 确认副标题显示"检测图片是否存在后期篡改风险"')
  console.log('  6. 确认默认只勾选"规则检测"（"模型检测"未勾选）')
  console.log('  7. 上传图片，点击"开始分析"，确认仅执行规则检测')
}
