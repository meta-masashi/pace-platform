"""
PACE v6.0 バイオメカニクス特徴量抽出パッケージ

モーションキャプチャ / IMU データから以下を抽出:
- 構造的脆弱性（Φ_structural）: 骨格アライメント異常による負荷増幅率
- ニューロモーター・ノイズ（η_NM）: 固有受容器不全による動作不安定性

出力はJSON形式でメインODE疲労エンジンに送信される。
"""

from .pipeline import run_biomechanics_pipeline

__version__ = "6.0.0"
__all__ = ["run_biomechanics_pipeline"]
