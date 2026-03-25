"""
PACE v6.0 バイオメカニクス特徴量抽出パイプライン テストスイート

pytest 互換。実行: pytest test_biomechanics.py -v
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from .preprocessing import (
    butterworth_lowpass,
    generate_synthetic_mocap,
    extract_phase,
    JOINT_NAMES,
)
from .structural_vulnerability import (
    calculate_joint_angle,
    calculate_knee_valgus_angle,
    calculate_trunk_lean,
    calculate_elbow_drop,
    calculate_q_angle,
    calculate_structural_vulnerability,
    ALIGNMENT_CRITERIA,
)
from .neuromotor_noise import (
    compute_sample_entropy,
    compute_neuromotor_noise,
    generate_synthetic_imu,
)
from .pipeline import run_biomechanics_pipeline


# ============================================================
# 前処理テスト
# ============================================================

class TestButterworthFilter:
    """Butterworthローパスフィルタのテスト"""

    def test_removes_high_frequency_noise(self) -> None:
        """高周波ノイズが除去されることを検証"""
        fs = 200.0
        t = np.linspace(0, 1.0, int(fs))
        # 低周波成分（5Hz）+ 高周波ノイズ（80Hz）
        clean_signal = np.sin(2 * np.pi * 5 * t)
        noisy_signal = clean_signal + 0.5 * np.sin(2 * np.pi * 80 * t)

        filtered = butterworth_lowpass(noisy_signal, cutoff=12.0, fs=fs)

        # フィルタ後は元の低周波信号に近いはず（中央部分で比較、端のエッジ効果を回避）
        mid = len(t) // 4
        end = 3 * len(t) // 4
        correlation = np.corrcoef(clean_signal[mid:end], filtered[mid:end])[0, 1]
        assert correlation > 0.95, f"フィルタ後の相関が低い: {correlation:.3f}"

    def test_preserves_low_frequency_content(self) -> None:
        """低周波成分が保持されることを検証"""
        fs = 200.0
        t = np.linspace(0, 2.0, int(2 * fs))
        signal = np.sin(2 * np.pi * 3 * t)  # 3Hz — カットオフ12Hz以下

        filtered = butterworth_lowpass(signal, cutoff=12.0, fs=fs)

        # 振幅がほぼ保持される
        mid = len(t) // 4
        end = 3 * len(t) // 4
        ratio = np.std(filtered[mid:end]) / np.std(signal[mid:end])
        assert 0.90 < ratio < 1.10, f"低周波信号の振幅変化が大きい: {ratio:.3f}"

    def test_handles_multidimensional_input(self) -> None:
        """多次元入力（N, 3）に対応"""
        fs = 200.0
        n = int(fs)
        data = np.random.randn(n, 3)
        filtered = butterworth_lowpass(data, cutoff=12.0, fs=fs)
        assert filtered.shape == (n, 3)


class TestSyntheticMocap:
    """合成モーションキャプチャデータ生成のテスト"""

    def test_generates_correct_number_of_frames(self) -> None:
        """指定フレーム数が正しい"""
        data = generate_synthetic_mocap(n_frames=300)
        assert data['n_frames'] == 300
        assert data['hip_l'].shape[0] == 300

    def test_contains_all_joints(self) -> None:
        """全関節データが含まれる"""
        data = generate_synthetic_mocap()
        for joint in JOINT_NAMES:
            assert joint in data, f"関節 {joint} が欠損"
            assert data[joint].shape == (500, 3)

    def test_knee_valgus_offset(self) -> None:
        """膝外反パラメータが膝位置に反映される"""
        data_no_valgus = generate_synthetic_mocap(knee_valgus_deg=0.0, add_noise=False)
        data_valgus = generate_synthetic_mocap(knee_valgus_deg=20.0, add_noise=False)

        # 右膝のX座標: 外反が大きいほど内側（X値が小さく）にシフト
        knee_r_no = np.mean(data_no_valgus['knee_r'][:, 0])
        knee_r_yes = np.mean(data_valgus['knee_r'][:, 0])
        assert knee_r_yes < knee_r_no, "膝外反によるX方向シフトが検出されない"

    def test_sampling_frequency_stored(self) -> None:
        """サンプリング周波数が正しく格納される"""
        data = generate_synthetic_mocap(fs=120.0)
        assert data['fs'] == 120.0


class TestPhaseExtraction:
    """動作フェーズ抽出のテスト"""

    def test_full_phase_returns_all_frames(self) -> None:
        """'full' フェーズは全フレームを返す"""
        data = generate_synthetic_mocap(n_frames=500)
        phase_data = extract_phase(data, phase='full')
        assert phase_data['n_frames'] == 500

    def test_landing_phase_extracts_subset(self) -> None:
        """'landing' フェーズはサブセットを返す"""
        data = generate_synthetic_mocap(n_frames=500, movement_type='landing')
        phase_data = extract_phase(data, phase='landing')
        assert phase_data['n_frames'] <= 500
        assert phase_data['n_frames'] > 0


# ============================================================
# 構造的脆弱性テスト
# ============================================================

class TestJointAngle:
    """関節角度計算のテスト"""

    def test_known_right_angle(self) -> None:
        """既知の直角（90°）を正しく計算"""
        p1 = np.array([1.0, 0.0, 0.0])
        p2 = np.array([0.0, 0.0, 0.0])  # 頂点
        p3 = np.array([0.0, 1.0, 0.0])
        angle = calculate_joint_angle(p1, p2, p3)
        assert abs(angle - 90.0) < 0.1, f"90°の角度が正しくない: {angle:.1f}"

    def test_known_straight_angle(self) -> None:
        """一直線（180°）を正しく計算"""
        p1 = np.array([1.0, 0.0, 0.0])
        p2 = np.array([0.0, 0.0, 0.0])
        p3 = np.array([-1.0, 0.0, 0.0])
        angle = calculate_joint_angle(p1, p2, p3)
        assert abs(angle - 180.0) < 0.1, f"180°の角度が正しくない: {angle:.1f}"

    def test_batch_computation(self) -> None:
        """バッチ（複数フレーム）計算"""
        p1 = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float64)
        p2 = np.zeros((2, 3), dtype=np.float64)
        p3 = np.array([[0, 1, 0], [0, 0, 1]], dtype=np.float64)
        angles = calculate_joint_angle(p1, p2, p3)
        assert angles.shape == (2,)
        assert abs(angles[0] - 90.0) < 0.1
        assert abs(angles[1] - 90.0) < 0.1


class TestKneeValgus:
    """膝外反角度検出のテスト"""

    def test_no_valgus_gives_small_angle(self) -> None:
        """膝外反なし → 小さい角度（解剖学的オフセット含む）"""
        data = generate_synthetic_mocap(knee_valgus_deg=0.0, add_noise=False)
        angles = calculate_knee_valgus_angle(
            data['hip_r'], data['knee_r'], data['ankle_r'],
        )
        mean_angle = float(np.mean(angles))
        # 解剖学的に股関節は膝より外側のため、0°外反でも ~6° の基底角度がある
        assert mean_angle < 10.0, f"外反なしでの角度が大きすぎる: {mean_angle:.1f}"

    def test_large_valgus_detected(self) -> None:
        """大きい膝外反 → 検出される"""
        data = generate_synthetic_mocap(knee_valgus_deg=20.0, add_noise=False)
        angles = calculate_knee_valgus_angle(
            data['hip_r'], data['knee_r'], data['ankle_r'],
        )
        mean_angle = float(np.mean(angles))
        assert mean_angle > 5.0, f"膝外反20°が検出されない: {mean_angle:.1f}"


class TestStructuralVulnerability:
    """構造的脆弱性指数のテスト"""

    def test_aligned_gives_low_phi(self) -> None:
        """正常アライメント → 低いΦ"""
        data = generate_synthetic_mocap(knee_valgus_deg=2.0, add_noise=False)
        result = calculate_structural_vulnerability(data)
        assert result['phi_structural'] < 1.0, \
            f"正常アライメントでΦが高すぎる: {result['phi_structural']}"
        assert result['overall_risk'] in ('low', 'moderate')

    def test_misaligned_gives_high_phi(self) -> None:
        """異常アライメント → 高いΦ"""
        data = generate_synthetic_mocap(knee_valgus_deg=25.0, add_noise=False)
        result = calculate_structural_vulnerability(data)
        assert result['phi_structural'] > 0.5, \
            f"異常アライメントでΦが低すぎる: {result['phi_structural']}"

    def test_load_multipliers_increase_with_phi(self) -> None:
        """Φ が大きいほど負荷増幅率が上昇"""
        data_low = generate_synthetic_mocap(knee_valgus_deg=2.0, add_noise=False)
        data_high = generate_synthetic_mocap(knee_valgus_deg=25.0, add_noise=False)
        result_low = calculate_structural_vulnerability(data_low)
        result_high = calculate_structural_vulnerability(data_high)

        for tissue in result_low['load_multipliers']:
            assert result_high['load_multipliers'][tissue] >= result_low['load_multipliers'][tissue]

    def test_returns_all_alignment_scores(self) -> None:
        """全アライメント基準のスコアが返される"""
        data = generate_synthetic_mocap()
        result = calculate_structural_vulnerability(data)
        for crit_name in ALIGNMENT_CRITERIA:
            assert crit_name in result['alignment_scores']


# ============================================================
# ニューロモーター・ノイズ テスト
# ============================================================

class TestSampleEntropy:
    """サンプルエントロピーのテスト"""

    def test_regular_signal_low_entropy(self) -> None:
        """規則的な信号 → 低いエントロピー"""
        t = np.linspace(0, 10, 1000)
        regular = np.sin(2 * np.pi * 1.0 * t)
        sampen = compute_sample_entropy(regular, m=2, r=0.2)
        assert sampen < 0.5, f"規則的信号のSampEnが高すぎる: {sampen:.4f}"

    def test_random_signal_high_entropy(self) -> None:
        """ランダム信号 → 高いエントロピー"""
        np.random.seed(42)
        random_signal = np.random.randn(500)
        sampen = compute_sample_entropy(random_signal, m=2, r=0.2)
        assert sampen > 0.5, f"ランダム信号のSampEnが低すぎる: {sampen:.4f}"

    def test_short_signal_returns_zero(self) -> None:
        """短すぎる信号 → 0.0 を返す"""
        short = np.array([1.0, 2.0])
        assert compute_sample_entropy(short) == 0.0


class TestNeuromotorNoise:
    """ニューロモーター・ノイズのテスト"""

    def test_normal_signal_low_eta(self) -> None:
        """正常信号 → 低い η_NM"""
        np.random.seed(123)
        imu = generate_synthetic_imu(n_samples=500, noise_level='normal')
        result = compute_neuromotor_noise(imu)
        assert result['eta_nm'] < 0.5, \
            f"正常信号での η_NM が高すぎる: {result['eta_nm']}"
        assert result['severity'] in ('normal', 'mild')

    def test_severe_signal_high_eta(self) -> None:
        """重度不安定信号 → 高い η_NM"""
        np.random.seed(456)
        imu = generate_synthetic_imu(n_samples=500, noise_level='severe')
        result = compute_neuromotor_noise(imu, injury_history_count=2)
        assert result['eta_nm'] > 0.3, \
            f"重度信号での η_NM が低すぎる: {result['eta_nm']}"

    def test_injury_history_increases_eta(self) -> None:
        """既往歴が η_NM を増加させる"""
        np.random.seed(789)
        imu = generate_synthetic_imu(n_samples=500, noise_level='mild')
        result_no_history = compute_neuromotor_noise(imu, injury_history_count=0)
        result_with_history = compute_neuromotor_noise(imu, injury_history_count=3)
        assert result_with_history['eta_nm'] > result_no_history['eta_nm']

    def test_effective_load_multiplier_format(self) -> None:
        """有効負荷増幅率 = 1 + η_NM"""
        np.random.seed(101)
        imu = generate_synthetic_imu(n_samples=500)
        result = compute_neuromotor_noise(imu)
        expected = round(1.0 + result['eta_nm'], 4)
        assert result['effective_load_multiplier'] == expected


# ============================================================
# パイプライン統合テスト
# ============================================================

class TestPipeline:
    """パイプライン統合テスト"""

    def test_full_pipeline_valid_json(self) -> None:
        """パイプライン出力が有効なJSONシリアライズ可能"""
        mocap = generate_synthetic_mocap(knee_valgus_deg=5.0)
        imu = generate_synthetic_imu(noise_level='normal')
        result = run_biomechanics_pipeline(
            mocap, imu, injury_history=0, athlete_id='TEST001',
        )
        # JSON シリアライズ可能であることを検証
        json_str = json.dumps(result, ensure_ascii=False)
        assert len(json_str) > 0

        # 必須フィールドの検証
        required_fields = [
            'athlete_id', 'vulnerability_phi', 'neuromotor_noise_eta',
            'effective_load_multiplier', 'structural_details',
            'neuromotor_details', 'risk_summary', 'recommendations',
        ]
        for field in required_fields:
            assert field in result, f"必須フィールド {field} が欠損"

    def test_pipeline_without_imu_data(self) -> None:
        """IMUデータなしでもグレースフルに動作"""
        mocap = generate_synthetic_mocap()
        result = run_biomechanics_pipeline(mocap, imu_signal=None)
        assert result['neuromotor_noise_eta'] == 0.0
        assert result['neuromotor_details']['severity'] == 'normal'

    def test_pipeline_without_mocap_data(self) -> None:
        """モーションキャプチャデータなしでもグレースフルに動作"""
        imu = generate_synthetic_imu()
        result = run_biomechanics_pipeline(mocap_data=None, imu_signal=imu)
        assert result['vulnerability_phi'] == 0.0

    def test_pipeline_athlete_id_propagated(self) -> None:
        """アスリートIDが出力に伝搬される"""
        result = run_biomechanics_pipeline(athlete_id='MY_ATHLETE_42')
        assert result['athlete_id'] == 'MY_ATHLETE_42'

    def test_pipeline_risk_summary_valid(self) -> None:
        """リスクサマリが有効な値"""
        mocap = generate_synthetic_mocap(knee_valgus_deg=10.0)
        imu = generate_synthetic_imu(noise_level='mild')
        result = run_biomechanics_pipeline(mocap, imu)
        assert result['risk_summary'] in ('low', 'moderate', 'high', 'critical')

    def test_pipeline_recommendations_non_empty(self) -> None:
        """推奨事項リストが空でない"""
        result = run_biomechanics_pipeline()
        assert len(result['recommendations']) > 0

    def test_pipeline_high_risk_case(self) -> None:
        """高リスクケースで有効負荷増幅率 > 1.0"""
        mocap = generate_synthetic_mocap(knee_valgus_deg=25.0)
        imu = generate_synthetic_imu(noise_level='severe')
        result = run_biomechanics_pipeline(mocap, imu, injury_history=3)
        assert result['effective_load_multiplier'] > 1.0


# ============================================================
# CLI 実行用
# ============================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
