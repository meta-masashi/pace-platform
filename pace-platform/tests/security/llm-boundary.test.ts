/**
 * tests/security/llm-boundary.test.ts
 * ============================================================
 * ADR-029: LLM 責任分離境界の自動テスト
 *
 * Node 0-4 は永続的に LLM フリー。
 * LLM 呼び出し（Gemini, OpenAI, Anthropic 等）は Node 5 以降のみ許可。
 *
 * このテストは CI で実行され、Node 0-4 に LLM インポートや
 * 呼び出しパターンが含まれないことを保証する。
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** LLM フリーが強制されるノードファイル（Node 0-4） */
const LLM_FREE_NODE_FILES = [
  'node0-ingestion.ts',
  'node1-cleaning.ts',
  'node2-feature-engineering.ts',
  'node3-inference.ts',
  'node4-decision.ts',
]

/** ノードディレクトリのパス */
const NODES_DIR = path.resolve(__dirname, '../../lib/engine/v6/nodes')

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

/** Node 5（LLM 許可）— テスト対象外であることを確認 */
const LLM_ALLOWED_FILES = ['node5-presentation.ts']

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('ADR-029: LLM Boundary Enforcement (Node 0-4 LLM-Free)', () => {
  // 各ノードファイルが存在することを確認
  it('全 LLM フリーノードファイルが存在する', () => {
    for (const fileName of LLM_FREE_NODE_FILES) {
      const filePath = path.join(NODES_DIR, fileName)
      expect(fs.existsSync(filePath), `${fileName} が見つかりません`).toBe(true)
    }
  })

  // 各ノードファイルに対してインポートチェック
  for (const fileName of LLM_FREE_NODE_FILES) {
    describe(`${fileName}`, () => {
      const filePath = path.join(NODES_DIR, fileName)

      let content: string
      try {
        content = fs.readFileSync(filePath, 'utf-8')
      } catch {
        content = ''
      }

      it('LLM 関連のインポートが含まれていない', () => {
        for (const pattern of BANNED_IMPORT_PATTERNS) {
          const match = content.match(pattern)
          expect(
            match,
            `${fileName} に禁止インポートが検出: ${match?.[0]}`,
          ).toBeNull()
        }
      })

      it('LLM 関連の関数呼び出しが含まれていない', () => {
        for (const pattern of BANNED_FUNCTION_PATTERNS) {
          const match = content.match(pattern)
          expect(
            match,
            `${fileName} に禁止関数呼び出しが検出: ${match?.[0]}`,
          ).toBeNull()
        }
      })
    })
  }

  // Node 5 がテスト対象外であることを明示
  it('Node 5 (presentation) は LLM 許可対象として除外されている', () => {
    expect(LLM_ALLOWED_FILES).toContain('node5-presentation.ts')
    expect(LLM_FREE_NODE_FILES).not.toContain('node5-presentation.ts')
  })
})
