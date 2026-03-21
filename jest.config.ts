import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // next.config.ts と .env.test を読み込む
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',

  // テストファイルのパターン
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // モジュールパスエイリアス（tsconfig.json の paths と対応）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // カバレッジ対象
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/app/layout.tsx',
    '!src/app/globals.css',
  ],

  // カバレッジ閾値（最低ライン）
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
}

export default createJestConfig(config)
