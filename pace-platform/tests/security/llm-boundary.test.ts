/**
 * tests/security/llm-boundary.test.ts
 * ============================================================
 * ADR-029: LLM 責任分離境界の自動テスト
 *
 * LLM 呼び出し（Gemini, OpenAI, Anthropic 等）は指定されたモジュールのみ許可。
 * Node 0-4 は永続的に LLM フリー。LLM は Node 5 (presentation) と lib/gemini/ のみ。
 * コンディショニングエンジン、スコア計算、データ永続化層も LLM フリー。
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** LLM フリーが強制される Node 0-4 ファイル */
const LLM_FREE_NODE_FILES = [
  'node0-ingestion.ts',
  'node1-cleaning.ts',
  'node2-feature-engineering.ts',
  'node3-inference.ts',
  'node4-decision.ts',
]

/** Node 5 は LLM 許可（Gemini 経由の NLG） */
const LLM_ALLOWED_FILES = ['node5-presentation.ts']

const NODES_DIR = path.resolve(__dirname, '../../lib/engine/v6/nodes')

/** LLM フリーが強制されるモジュールディレクトリ */
const LLM_FREE_DIRS = [
  'conditioning',
  'shared',
  'calendar',
]

const LIB_DIR = path.resolve(__dirname, '../../lib')

/** LLM 関連のインポートパターン（正規表現） */
const BANNED_IMPORT_PATTERNS = [
  /@google\/generative-ai/,
  /@google-cloud\/aiplatform/,
  /openai/,
  /anthropic/,
  /@anthropic-ai/,
  /langchain/,
  /lib\/gemini/,
  /lib\/llm/,
  /lib\/ai\//,
]

/** LLM 関連の関数呼び出しパターン */
const BANNED_FUNCTION_PATTERNS = [
  /generateContent\s*\(/,
  /createChatCompletion\s*\(/,
  /createCompletion\s*\(/,
  /messages\.create\s*\(/,
  /chat\.completions/,
  /callGemini/,
  /callOpenAI/,
  /callAnthropic/,
]

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function findTsFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('ADR-029: LLM Boundary Enforcement', () => {
  for (const dirName of LLM_FREE_DIRS) {
    const dirPath = path.join(LIB_DIR, dirName)

    describe(`lib/${dirName}/ は LLM フリー`, () => {
      const files = findTsFiles(dirPath)

      it('ディレクトリが存在する', () => {
        expect(fs.existsSync(dirPath), `lib/${dirName} が見つかりません`).toBe(true)
      })

      for (const filePath of files) {
        const relPath = path.relative(LIB_DIR, filePath)
        const content = fs.readFileSync(filePath, 'utf-8')

        it(`${relPath} に LLM インポートが含まれていない`, () => {
          for (const pattern of BANNED_IMPORT_PATTERNS) {
            const match = content.match(pattern)
            expect(
              match,
              `${relPath} に禁止インポートが検出: ${match?.[0]}`,
            ).toBeNull()
          }
        })

        it(`${relPath} に LLM 関数呼び出しが含まれていない`, () => {
          for (const pattern of BANNED_FUNCTION_PATTERNS) {
            const match = content.match(pattern)
            expect(
              match,
              `${relPath} に禁止関数呼び出しが検出: ${match?.[0]}`,
            ).toBeNull()
          }
        })
      }
    })
  }

  // Node 0-4 LLM フリー検証
  describe('v6 Pipeline: Node 0-4 は LLM フリー', () => {
    it('全 LLM フリーノードファイルが存在する', () => {
      for (const fileName of LLM_FREE_NODE_FILES) {
        const filePath = path.join(NODES_DIR, fileName)
        expect(fs.existsSync(filePath), `${fileName} が見つかりません`).toBe(true)
      }
    })

    for (const fileName of LLM_FREE_NODE_FILES) {
      const filePath = path.join(NODES_DIR, fileName)
      let content = ''
      try { content = fs.readFileSync(filePath, 'utf-8') } catch { /* empty */ }

      it(`${fileName} に LLM インポートが含まれていない`, () => {
        for (const pattern of BANNED_IMPORT_PATTERNS) {
          const match = content.match(pattern)
          expect(match, `${fileName} に禁止インポート: ${match?.[0]}`).toBeNull()
        }
      })

      it(`${fileName} に LLM 関数呼び出しが含まれていない`, () => {
        for (const pattern of BANNED_FUNCTION_PATTERNS) {
          const match = content.match(pattern)
          expect(match, `${fileName} に禁止関数呼び出し: ${match?.[0]}`).toBeNull()
        }
      })
    }

    it('Node 5 (presentation) は LLM 許可対象として除外されている', () => {
      expect(LLM_ALLOWED_FILES).toContain('node5-presentation.ts')
      expect(LLM_FREE_NODE_FILES).not.toContain('node5-presentation.ts')
    })
  })

  it('LLM 呼び出しは lib/gemini/ 配下に限定されている', () => {
    const geminiDir = path.join(LIB_DIR, 'gemini')
    expect(fs.existsSync(geminiDir)).toBe(true)
  })
})
