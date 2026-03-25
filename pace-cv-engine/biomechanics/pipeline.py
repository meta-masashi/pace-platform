"""
PACE v6.0 バイオメカニクス特徴量抽出パイプライン

モーションキャプチャ/IMUデータから構造的脆弱性（Φ）と
ニューロモーター・ノイズ（η_NM）を抽出し、
メインODEエンジンへのペナルティ係数をJSON出力する。
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from .preprocessing import generate_synthetic_mocap, extract_phase
from .structural_vulnerability import calculate_structural_vulnerability
from .neuromotor_noise import compute_neuromotor_noise, generate_synthetic_imu


def _generate_recommendations(
    phi: float,
    eta: float,
    structural_details: dict,
    neuromotor_details: dict,
) -> list[str]:
    """リスクに基づく推奨事項を生成"""
    recs: list[str] = []

    # 構造的脆弱性に基づく推奨
    overall_risk = structural_details.get('overall_risk', 'low')
    if overall_risk in ('high', 'critical'):
        recs.append('アライメント矯正エクササイズの実施を推奨します。')
    if overall_risk == 'critical':
        recs.append('トレーニング負荷の即時軽減を検討してください。')

    # 個別アライメント項目
    scores = structural_details.get('alignment_scores', {})
    for crit_name, score_info in scores.items():
        if score_info.get('risk_level') in ('high', 'critical'):
            name_jp = score_info.get('name', crit_name)
            recs.append(f'{name_jp}の改善プログラムを優先してください。')

    # ニューロモーター・ノイズに基づく推奨
    severity = neuromotor_details.get('severity', 'normal')
    if severity == 'mild':
        recs.append('ウォーミングアップの延長（+5分）を推奨します。')
    elif severity == 'moderate':
        recs.append('固有受容器トレーニング（バランスボード等）の追加を推奨します。')
    elif severity == 'severe':
        recs.append('高強度トレーニングの一時中断と神経筋機能の再評価を推奨します。')

    # 複合リスク
    if phi > 0.7 and eta > 0.35:
        recs.append('構造的脆弱性と神経筋ノイズの複合リスクが高い状態です。'
                     '専門家によるフルアセスメントを推奨します。')

    if not recs:
        recs.append('現在のコンディションは良好です。通常のトレーニングを継続してください。')

    return recs


def _determine_risk_summary(phi: float, eta: float) -> str:
    """Φ と η_NM の複合リスクサマリ"""
    combined = phi * 0.6 + eta * 0.4  # 重み付き複合スコア
    if combined < 0.2:
        return 'low'
    elif combined < 0.5:
        return 'moderate'
    elif combined < 0.8:
        return 'high'
    else:
        return 'critical'


def run_biomechanics_pipeline(
    mocap_data: dict | None = None,
    imu_signal: np.ndarray | None = None,
    injury_history: int = 0,
    athlete_id: str = 'unknown',
) -> dict[str, Any]:
    """
    バイオメカニクス特徴量抽出パイプラインの実行

    Args:
        mocap_data: parse_biomech_data() の出力 or generate_synthetic_mocap() の出力
        imu_signal: IMU加速度時系列 (1D np.ndarray)
        injury_history: 過去の同部位負傷回数
        athlete_id: アスリートID

    Returns JSON-serializable dict:
    {
        "athlete_id": "ATH001",
        "vulnerability_phi": 1.25,
        "neuromotor_noise_eta": 0.15,
        "effective_load_multiplier": 1.15,
        "structural_details": {...},
        "neuromotor_details": {...},
        "risk_summary": "moderate",
        "recommendations": ["..."]
    }
    """
    # --- 構造的脆弱性の計算 ---
    if mocap_data is not None:
        # 着地フェーズの抽出（データがあれば）
        phase_data = extract_phase(mocap_data, phase='full')
        structural_result = calculate_structural_vulnerability(phase_data)
    else:
        # モーションキャプチャデータなしの場合はデフォルト値
        structural_result = {
            'phi_structural': 0.0,
            'load_multipliers': {
                'muscle': 1.0,
                'tendon': 1.0,
                'ligament': 1.0,
                'cartilage': 1.0,
                'bone': 1.0,
            },
            'alignment_scores': {},
            'overall_risk': 'low',
        }

    phi = structural_result['phi_structural']

    # --- ニューロモーター・ノイズの計算 ---
    if imu_signal is not None:
        neuromotor_result = compute_neuromotor_noise(
            signal=imu_signal,
            injury_history_count=injury_history,
        )
    else:
        # IMUデータなしの場合はデフォルト値
        neuromotor_result = {
            'sample_entropy': 0.0,
            'eta_nm': 0.0,
            'effective_load_multiplier': 1.0,
            'severity': 'normal',
            'interpretation': 'IMUデータが提供されていないため評価できません。',
        }

    eta = neuromotor_result['eta_nm']

    # --- 複合リスク評価 ---
    risk_summary = _determine_risk_summary(phi, eta)
    recommendations = _generate_recommendations(
        phi, eta, structural_result, neuromotor_result,
    )

    # --- ODE エンジン向けの有効負荷増幅率 ---
    # 構造的脆弱性の靭帯負荷増幅率 × ニューロモーター・ノイズ増幅率
    effective_multiplier = structural_result['load_multipliers'].get('ligament', 1.0) \
        * neuromotor_result['effective_load_multiplier']

    return {
        'athlete_id': athlete_id,
        'vulnerability_phi': round(phi, 4),
        'neuromotor_noise_eta': round(eta, 4),
        'effective_load_multiplier': round(effective_multiplier, 4),
        'structural_details': structural_result,
        'neuromotor_details': neuromotor_result,
        'risk_summary': risk_summary,
        'recommendations': recommendations,
    }


def main() -> None:
    """デモ実行: 合成データでパイプラインをテスト"""
    print("=" * 60)
    print("PACE v6.0 バイオメカニクス特徴量抽出パイプライン")
    print("=" * 60)

    # Case 1: 健常アスリート
    print("\n【ケース1: 健常アスリート】")
    mocap_healthy = generate_synthetic_mocap(knee_valgus_deg=3.0)
    imu_healthy = generate_synthetic_imu(noise_level='normal')
    result1 = run_biomechanics_pipeline(
        mocap_healthy, imu_healthy, injury_history=0, athlete_id='ATH001',
    )
    print(json.dumps(result1, indent=2, ensure_ascii=False))

    # Case 2: ACL再建術後のアスリート（膝外反 + 固有受容器不全）
    print("\n【ケース2: ACL再建術後アスリート（高リスク）】")
    mocap_acl = generate_synthetic_mocap(knee_valgus_deg=18.0)
    imu_acl = generate_synthetic_imu(noise_level='severe')
    result2 = run_biomechanics_pipeline(
        mocap_acl, imu_acl, injury_history=2, athlete_id='ATH002',
    )
    print(json.dumps(result2, indent=2, ensure_ascii=False))

    # Case 3: 疲労蓄積アスリート（動作品質低下）
    print("\n【ケース3: 疲労蓄積アスリート】")
    mocap_fatigued = generate_synthetic_mocap(knee_valgus_deg=10.0)
    imu_fatigued = generate_synthetic_imu(noise_level='mild')
    result3 = run_biomechanics_pipeline(
        mocap_fatigued, imu_fatigued, injury_history=1, athlete_id='ATH003',
    )
    print(json.dumps(result3, indent=2, ensure_ascii=False))

    print("\n" + "=" * 60)
    print("パイプライン実行完了")


if __name__ == '__main__':
    main()
