# PACE 数理モデル高度化修正案 v6.0 — Computational Biomechanics & Physiology

- **作成日**: 2026-03-25
- **ステータス**: ヒアリング中（Q1-Q5 回答待ち）
- **対象**: PACE Platform 次期推論エンジン — 高度数理モデル群

---

## 目次

1. [モデル 1: Damage-Remodeling ODE（非線形組織損傷・修復モデル）](#モデル-1-damage-remodeling-ode非線形組織損傷修復モデル)
2. [モデル 2: MRF Kinetic Chain（マルコフ確率場テンセグリティ運動連鎖）](#モデル-2-mrf-kinetic-chainマルコフ確率場テンセグリティ運動連鎖)
3. [モデル 3: Structural Vulnerability Tensor（応力集中テンソル）](#モデル-3-structural-vulnerability-tensor応力集中テンソル)
4. [モデル 4: Neuromotor Sample Entropy（神経運動系サンプルエントロピー）](#モデル-4-neuromotor-sample-entropy神経運動系サンプルエントロピー)
5. [モデル 5: Extended Kalman Filter for Decoupling Detection（デカップリング検出 EKF）](#モデル-5-extended-kalman-filter-for-decoupling-detectionデカップリング検出-ekf)

---

## モデル 1: Damage-Remodeling ODE（非線形組織損傷・修復モデル）

### 1.1 概要

組織レベルの損傷蓄積と修復プロセスを非線形常微分方程式（ODE）で記述する。従来の線形 ACWR モデルでは捉えきれない、組織の非線形応答（微小損傷の蓄積・閾値効果・修復遅延）をモデル化する。

### 1.2 数学的定式化

**状態変数**:
- `D(t)`: 組織損傷レベル（0 = 健常、1 = 完全損傷）
- `R(t)`: 修復能力（0 = 修復不能、1 = 最大修復能力）

**支配方程式**:

```
dD/dt = α · σ(t)ⁿ · (1 − D)⁻ᵐ − β · R(t) · D(t)
```

```
dR/dt = γ · (R_eq − R(t)) − δ · σ(t) · R(t)
```

ここで:
- `σ(t)`: 時刻 t における機械的負荷（外力・応力）
- `α`: 損傷感受性係数（組織タイプ依存）
- `n`: 応力指数（非線形性を制御、典型的に n = 2-4）
- `m`: 損傷加速指数（損傷蓄積による脆弱化、典型的に m = 1-2）
- `β`: 修復速度係数
- `γ`: 修復能力の回復速度
- `R_eq`: 修復能力の平衡値（恒常性レベル）
- `δ`: 負荷による修復能力の低下係数

### 1.3 臨界損傷閾値

損傷レベルが臨界閾値 `D_crit` を超えると、修復が追いつかなくなり急速に損傷が進行する:

```
D_crit = β · R_eq / (α · σ_mean^n)
```

ここで `σ_mean` は平均負荷レベル。`D(t) > D_crit` の場合、臨床的傷害リスクが急激に上昇する。

### 1.4 パラメータ推定

| パラメータ | 典型的範囲 | 推定方法 |
|-----------|-----------|---------|
| α | 0.001 - 0.1 | 組織タイプ別の文献値 + 個人較正 |
| n | 2.0 - 4.0 | Wöhler 曲線からの回帰 |
| m | 1.0 - 2.0 | 疲労試験データからの推定 |
| β | 0.01 - 0.5 | 回復曲線フィッティング |
| γ | 0.05 - 0.2 | 長期回復データ |
| R_eq | 0.6 - 1.0 | ベースライン評価 |
| δ | 0.001 - 0.05 | オーバートレーニング応答データ |

### 1.5 実装ノート

**ライブラリ**: SciPy (`scipy.integrate.solve_ivp`)

```python
from scipy.integrate import solve_ivp
import numpy as np

def damage_remodeling_ode(t, y, params, load_fn):
    """
    Damage-Remodeling ODE system.

    Parameters:
        t: time
        y: [D, R] state vector
        params: dict with alpha, n, m, beta, gamma, R_eq, delta
        load_fn: callable returning stress at time t
    """
    D, R = y
    sigma = load_fn(t)

    alpha, n, m = params['alpha'], params['n'], params['m']
    beta, gamma = params['beta'], params['gamma']
    R_eq, delta = params['R_eq'], params['delta']

    # 損傷蓄積（非線形） − 修復
    dD_dt = alpha * sigma**n * (1 - D)**(-m) - beta * R * D

    # 修復能力の動態
    dR_dt = gamma * (R_eq - R) - delta * sigma * R

    return [dD_dt, dR_dt]

def simulate_damage(load_series, params, t_span, D0=0.0, R0=1.0):
    """Run damage-remodeling simulation over a time series."""
    from scipy.interpolate import interp1d

    t_eval = np.linspace(t_span[0], t_span[1], len(load_series))
    load_fn = interp1d(t_eval, load_series, kind='linear', fill_value='extrapolate')

    sol = solve_ivp(
        damage_remodeling_ode,
        t_span,
        [D0, R0],
        args=(params, load_fn),
        t_eval=t_eval,
        method='RK45',
        max_step=0.1
    )

    return sol
```

### 1.6 Node 3 統合

パイプラインの Node 3（Inference Engine）において、ACWR と並行して Damage-Remodeling ODE を実行し、結果を統合する:

```
composite_risk = w_acwr × risk_acwr + w_ode × risk_ode
```

`risk_ode = D(t) / D_crit` で正規化し、1.0 を超えると臨界域。

---

## モデル 2: MRF Kinetic Chain（マルコフ確率場テンセグリティ運動連鎖）

### 2.1 概要

人体の運動連鎖をマルコフ確率場（MRF: Markov Random Field）としてモデル化する。テンセグリティ構造の原理に基づき、関節・筋群間の相互依存関係をグラフ構造で表現し、局所的な機能不全が連鎖的に波及するパターンを確率的に推論する。

### 2.2 グラフ構造定義

**ノード（関節・筋群セグメント）**:

```
V = {足関節, 膝関節, 股関節, 腰椎, 胸椎, 肩関節, 肘関節, 手関節,
     頸椎, 仙腸関節}
```

**エッジ（運動連鎖の接続）**:

```
E = {(足関節, 膝関節), (膝関節, 股関節), (股関節, 腰椎),
     (股関節, 仙腸関節), (腰椎, 胸椎), (胸椎, 肩関節),
     (胸椎, 頸椎), (肩関節, 肘関節), (肘関節, 手関節),
     (仙腸関節, 腰椎)}
```

### 2.3 MRF エネルギー関数

ギブス分布に基づくエネルギー関数:

```
P(X) = (1/Z) · exp(−E(X))
```

```
E(X) = Σᵢ φᵢ(xᵢ) + Σ_{(i,j)∈E} ψᵢⱼ(xᵢ, xⱼ)
```

ここで:
- `xᵢ ∈ {0, 1, 2}`: ノード i の状態（0=正常、1=軽度機能不全、2=重度機能不全）
- `φᵢ(xᵢ)`: 単項ポテンシャル（個別セグメントの観測データから算出）
- `ψᵢⱼ(xᵢ, xⱼ)`: ペアワイズポテンシャル（隣接セグメント間の相互作用）
- `Z`: 分配関数（正規化定数）

### 2.4 単項ポテンシャル

```
φᵢ(xᵢ) = −log P(observation_i | state = xᵢ)
```

観測データ（ROM、筋力テスト、痛み評価）から各セグメントの状態確率を推定する。

### 2.5 ペアワイズポテンシャル

テンセグリティ原理に基づく相互作用:

```
ψᵢⱼ(xᵢ, xⱼ) = −λᵢⱼ · 𝟙(xᵢ ≠ xⱼ) · |xᵢ − xⱼ|
```

ここで:
- `λᵢⱼ`: 結合強度（解剖学的・バイオメカニクス的結合の強さ）
- `𝟙(xᵢ ≠ xⱼ)`: 状態が異なる場合の指示関数
- `|xᵢ − xⱼ|`: 状態差の絶対値

**結合強度行列（λ）**:

| | 足関節 | 膝関節 | 股関節 | 腰椎 | 胸椎 | 肩関節 |
|---|---|---|---|---|---|---|
| 足関節 | — | 0.8 | 0.3 | 0.1 | 0.0 | 0.0 |
| 膝関節 | 0.8 | — | 0.9 | 0.2 | 0.0 | 0.0 |
| 股関節 | 0.3 | 0.9 | — | 0.85 | 0.3 | 0.1 |
| 腰椎 | 0.1 | 0.2 | 0.85 | — | 0.8 | 0.2 |
| 胸椎 | 0.0 | 0.0 | 0.3 | 0.8 | — | 0.7 |
| 肩関節 | 0.0 | 0.0 | 0.1 | 0.2 | 0.7 | — |

### 2.6 推論アルゴリズム

ループを含むグラフのため、Loopy Belief Propagation（LBP）を使用:

```
mᵢ→ⱼ(xⱼ) = Σ_{xᵢ} [exp(−φᵢ(xᵢ) − ψᵢⱼ(xᵢ, xⱼ)) · Π_{k∈N(i)\j} m_{k→i}(xᵢ)]
```

収束後の周辺確率:

```
bᵢ(xᵢ) ∝ exp(−φᵢ(xᵢ)) · Π_{j∈N(i)} m_{j→i}(xᵢ)
```

### 2.7 実装ノート

**ライブラリ**: NetworkX（グラフ構造管理） + カスタム LBP 実装

```python
import networkx as nx
import numpy as np

class KineticChainMRF:
    """Markov Random Field model for kinetic chain analysis."""

    def __init__(self):
        self.graph = nx.Graph()
        self._build_kinetic_chain()

    def _build_kinetic_chain(self):
        """Build the anatomical kinetic chain graph."""
        segments = [
            'ankle', 'knee', 'hip', 'lumbar', 'thoracic',
            'shoulder', 'elbow', 'wrist', 'cervical', 'si_joint'
        ]
        self.graph.add_nodes_from(segments)

        edges_with_coupling = [
            ('ankle', 'knee', 0.8),
            ('knee', 'hip', 0.9),
            ('hip', 'lumbar', 0.85),
            ('hip', 'si_joint', 0.7),
            ('lumbar', 'thoracic', 0.8),
            ('thoracic', 'shoulder', 0.7),
            ('thoracic', 'cervical', 0.6),
            ('shoulder', 'elbow', 0.75),
            ('elbow', 'wrist', 0.65),
            ('si_joint', 'lumbar', 0.75),
        ]

        for u, v, coupling in edges_with_coupling:
            self.graph.add_edge(u, v, coupling_strength=coupling)

    def compute_unary_potential(self, segment, observations):
        """Compute unary potential from clinical observations."""
        rom_score = observations.get(f'{segment}_rom', 1.0)
        strength_score = observations.get(f'{segment}_strength', 1.0)
        pain_score = observations.get(f'{segment}_pain', 0.0)

        # State probabilities: [normal, mild_dysfunction, severe_dysfunction]
        probs = np.array([
            rom_score * strength_score * (1 - pain_score),
            0.5 * (1 - rom_score * strength_score) + 0.3 * pain_score,
            0.5 * (1 - rom_score * strength_score) * pain_score
        ])
        probs /= probs.sum()

        return -np.log(probs + 1e-10)

    def run_belief_propagation(self, observations, max_iter=50, tol=1e-6):
        """Run Loopy Belief Propagation on the kinetic chain."""
        nodes = list(self.graph.nodes)
        n_states = 3

        # Initialize messages
        messages = {}
        for u, v in self.graph.edges:
            messages[(u, v)] = np.ones(n_states) / n_states
            messages[(v, u)] = np.ones(n_states) / n_states

        # Compute unary potentials
        unary = {node: self.compute_unary_potential(node, observations)
                 for node in nodes}

        for iteration in range(max_iter):
            max_diff = 0.0

            for u, v in self.graph.edges:
                coupling = self.graph[u][v]['coupling_strength']

                for sender, receiver in [(u, v), (v, u)]:
                    # Compute new message
                    new_msg = np.zeros(n_states)
                    for xr in range(n_states):
                        vals = []
                        for xs in range(n_states):
                            pairwise = -coupling * abs(xs - xr) * (xs != xr)
                            incoming = sum(
                                np.log(messages[(k, sender)][xs] + 1e-10)
                                for k in self.graph.neighbors(sender)
                                if k != receiver
                            )
                            vals.append(np.exp(
                                -unary[sender][xs] + pairwise + incoming
                            ))
                        new_msg[xr] = sum(vals)

                    new_msg /= new_msg.sum() + 1e-10
                    max_diff = max(max_diff,
                                   np.max(np.abs(new_msg - messages[(sender, receiver)])))
                    messages[(sender, receiver)] = new_msg

            if max_diff < tol:
                break

        # Compute beliefs
        beliefs = {}
        for node in nodes:
            belief = np.exp(-unary[node])
            for neighbor in self.graph.neighbors(node):
                belief *= messages[(neighbor, node)]
            belief /= belief.sum()
            beliefs[node] = belief

        return beliefs
```

### 2.8 臨床的解釈

MRF の出力（各セグメントの周辺確率）を以下のように臨床的に解釈する:

| 周辺確率 P(xᵢ=2) | 解釈 | 推奨 |
|-------------------|------|------|
| > 0.7 | 重度機能不全の可能性が高い | 即座の精密検査 |
| 0.4 - 0.7 | 中等度リスク | 予防的介入開始 |
| 0.2 - 0.4 | 軽度リスク（連鎖波及の可能性） | モニタリング強化 |
| < 0.2 | 正常範囲 | 通常モニタリング |

---

## モデル 3: Structural Vulnerability Tensor（応力集中テンソル）

### 3.1 概要

筋骨格系の構造的脆弱性を応力集中テンソルとして定量化する。解剖学的構造、負荷パターン、組織特性から応力集中が生じやすい部位を特定し、傷害リスクの空間的分布をマッピングする。

### 3.2 応力集中テンソル定義

3次元応力テンソル `σ` を、身体セグメントの局所座標系で定義する:

```
σ = | σ_xx  τ_xy  τ_xz |
    | τ_yx  σ_yy  τ_yz |
    | τ_zx  τ_zy  σ_zz |
```

### 3.3 脆弱性指標（Vulnerability Index）

Von Mises 等価応力を用いた脆弱性指標:

```
σ_vm = √(0.5 · [(σ_xx − σ_yy)² + (σ_yy − σ_zz)² + (σ_zz − σ_xx)² + 6·(τ_xy² + τ_yz² + τ_xz²)])
```

脆弱性指標:

```
VI(t) = σ_vm(t) / σ_yield(tissue)
```

ここで:
- `σ_yield(tissue)`: 組織タイプごとの降伏応力（損傷開始閾値）
- `VI > 1.0`: 組織損傷が開始される領域

### 3.4 応力集中係数（SCF — Stress Concentration Factor）

解剖学的形状の不連続性（腱付着部、筋腱移行部等）による応力集中:

```
K_t = σ_max / σ_nominal
```

修正脆弱性指標:

```
VI_modified = K_t × VI(t) × fatigue_factor(D(t))
```

ここで `fatigue_factor(D(t))` はモデル 1 の損傷レベル `D(t)` に依存する疲労係数:

```
fatigue_factor(D) = 1 + α_f · D / (1 − D)
```

### 3.5 主応力解析

応力テンソルの固有値（主応力）と固有ベクトル（主応力方向）を計算:

```
det(σ − λI) = 0
```

3つの主応力 `σ₁ ≥ σ₂ ≥ σ₃` から:

- **最大主応力 σ₁**: 引張による損傷リスク（靭帯・腱）
- **最大剪断応力 τ_max = (σ₁ − σ₃)/2**: 剪断による損傷リスク（半月板・関節包）
- **静水圧応力 σ_h = (σ₁ + σ₂ + σ₃)/3**: 圧縮による損傷リスク（軟骨・骨）

### 3.6 身体部位別の応力集中係数

| 部位 | K_t 範囲 | 主な損傷メカニズム | σ_yield 参考値 |
|------|---------|-------------------|---------------|
| ACL 付着部 | 2.5 - 4.0 | 前方剪断 + 回旋 | 38 MPa |
| アキレス腱中間部 | 1.5 - 2.5 | 引張 + 繰返し負荷 | 70 MPa |
| 筋腱移行部（ハムストリング） | 2.0 - 3.5 | 遠心性引張 | 15 MPa |
| 腰椎椎間板 | 1.8 - 3.0 | 圧縮 + 屈曲 | 10 MPa |
| 肩腱板挿入部 | 2.0 - 3.0 | 圧迫 + 引張 | 25 MPa |
| 脛骨内側面 | 1.5 - 2.0 | 繰返し曲げ | 130 MPa（骨） |

### 3.7 実装ノート

**ライブラリ**: NumPy（テンソル計算）、SciPy（固有値分解）

```python
import numpy as np
from scipy.linalg import eigvalsh

class VulnerabilityTensor:
    """Structural vulnerability analysis using stress concentration tensor."""

    # 組織タイプ別の降伏応力 (MPa)
    YIELD_STRESS = {
        'ligament': 38.0,
        'tendon': 70.0,
        'muscle_tendon_junction': 15.0,
        'intervertebral_disc': 10.0,
        'rotator_cuff': 25.0,
        'bone_cortical': 130.0,
        'cartilage': 5.0,
    }

    # 解剖学的部位別の応力集中係数
    SCF = {
        'acl_insertion': 3.0,
        'achilles_midportion': 2.0,
        'hamstring_mtj': 2.5,
        'lumbar_disc': 2.2,
        'rotator_cuff_insertion': 2.5,
        'tibial_medial': 1.7,
    }

    @staticmethod
    def compute_von_mises(stress_tensor: np.ndarray) -> float:
        """Compute Von Mises equivalent stress from 3x3 stress tensor."""
        s = stress_tensor
        vm = np.sqrt(0.5 * (
            (s[0,0] - s[1,1])**2 +
            (s[1,1] - s[2,2])**2 +
            (s[2,2] - s[0,0])**2 +
            6 * (s[0,1]**2 + s[1,2]**2 + s[0,2]**2)
        ))
        return vm

    @staticmethod
    def compute_principal_stresses(stress_tensor: np.ndarray) -> np.ndarray:
        """Compute principal stresses (eigenvalues) sorted descending."""
        eigenvalues = eigvalsh(stress_tensor)
        return np.sort(eigenvalues)[::-1]  # σ₁ ≥ σ₂ ≥ σ₃

    def vulnerability_index(
        self,
        stress_tensor: np.ndarray,
        tissue_type: str,
        anatomical_site: str,
        damage_level: float = 0.0,
        alpha_f: float = 2.0
    ) -> dict:
        """
        Compute modified vulnerability index.

        Returns dict with VI, principal stresses, and risk classification.
        """
        sigma_vm = self.compute_von_mises(stress_tensor)
        sigma_yield = self.YIELD_STRESS.get(tissue_type, 50.0)
        K_t = self.SCF.get(anatomical_site, 1.0)

        # Fatigue factor from damage level
        fatigue = 1 + alpha_f * damage_level / (1 - damage_level + 1e-10)

        # Base and modified VI
        vi_base = sigma_vm / sigma_yield
        vi_modified = K_t * vi_base * fatigue

        # Principal stress analysis
        principals = self.compute_principal_stresses(stress_tensor)
        tau_max = (principals[0] - principals[2]) / 2
        sigma_h = principals.mean()

        return {
            'von_mises_stress': sigma_vm,
            'vulnerability_index': vi_base,
            'modified_vulnerability_index': vi_modified,
            'principal_stresses': principals.tolist(),
            'max_shear_stress': tau_max,
            'hydrostatic_stress': sigma_h,
            'stress_concentration_factor': K_t,
            'fatigue_factor': fatigue,
            'risk_classification': self._classify_risk(vi_modified),
        }

    @staticmethod
    def _classify_risk(vi: float) -> str:
        if vi > 1.0:
            return 'CRITICAL'
        elif vi > 0.7:
            return 'HIGH'
        elif vi > 0.4:
            return 'MODERATE'
        else:
            return 'LOW'
```

---

## モデル 4: Neuromotor Sample Entropy（神経運動系サンプルエントロピー）

### 4.1 概要

サンプルエントロピー（SampEn）を用いて、運動制御の複雑性・規則性を定量化する。固有受容感覚（プロプリオセプション）の機能評価として、運動時系列の予測可能性を測定し、神経運動系の健全性を評価する。

### 4.2 サンプルエントロピーの定義

長さ `N` の時系列 `{u(1), u(2), ..., u(N)}` に対して:

```
SampEn(m, r, N) = −ln(A / B)
```

ここで:
- `m`: 埋め込み次元（テンプレート長）
- `r`: 許容誤差（tolerance）、通常は標準偏差の 0.1-0.25 倍
- `B`: 長さ `m` のテンプレートマッチ数
- `A`: 長さ `m+1` のテンプレートマッチ数

### 4.3 テンプレートマッチの定義

2つのテンプレートベクトル `x_m(i)` と `x_m(j)` のマッチ判定:

```
d[x_m(i), x_m(j)] = max_{k=0,...,m-1} |u(i+k) − u(j+k)| ≤ r
```

```
B = (N − m)⁻¹ · Σᵢ Bᵢ^m(r)
```

```
A = (N − m)⁻¹ · Σᵢ Aᵢ^m(r)
```

### 4.4 臨床的解釈

| SampEn 値 | 解釈 | 臨床的意味 |
|-----------|------|-----------|
| 高い（> 1.5） | 高い複雑性・不規則性 | 健常な神経運動制御 |
| 中程度（0.5 - 1.5） | 中程度の複雑性 | 注意が必要な領域 |
| 低い（< 0.5） | 高い規則性・予測可能性 | 固有受容感覚の低下、運動パターンの硬直化 |
| 極端に高い（> 2.5） | ランダムに近い | センサーノイズ or 制御の崩壊 |

### 4.5 プロプリオセプション評価プロトコル

**測定対象の時系列**:

| 時系列 | 測定方法 | サンプリング周波数 | 典型的長さ |
|--------|---------|-------------------|-----------|
| 重心動揺（COP）| フォースプレート | 100 Hz | 30秒 (3000点) |
| 関節角度変動 | IMU/ゴニオメーター | 100 Hz | 30秒 |
| 筋活動変動 | sEMG | 1000 Hz | 10秒 |
| バランスタスク | 加速度計 | 100 Hz | 30秒 |

**推奨パラメータ**:

| パラメータ | 推奨値 | 根拠 |
|-----------|--------|------|
| m | 2 | Richman & Moorman (2000) |
| r | 0.2 × SD | 標準的な許容誤差 |
| N | ≥ 1000 | 安定した推定に必要な最小長 |

### 4.6 多スケールエントロピー（MSE）拡張

単一スケールの SampEn を拡張し、複数の時間スケールでエントロピーを計算する:

**粗視化（Coarse-graining）**:

```
y_j^(τ) = (1/τ) · Σ_{i=(j-1)τ+1}^{jτ} u(i)
```

ここで `τ` はスケールファクター。各スケールで SampEn を計算:

```
MSE(τ) = SampEn(m, r, y^(τ))
```

健常な生理系は複数スケールにわたって高いエントロピーを維持する（"complexity matching"）。

### 4.7 実装ノート

**ライブラリ**: EntropyHub（高速サンプルエントロピー計算）

```python
import numpy as np

# EntropyHub がインストール済みの場合
try:
    import EntropyHub as EH

    def compute_sample_entropy(time_series, m=2, r_factor=0.2):
        """
        Compute sample entropy using EntropyHub.

        Parameters:
            time_series: 1D numpy array
            m: embedding dimension
            r_factor: tolerance as fraction of SD
        """
        r = r_factor * np.std(time_series)
        se, _, _ = EH.SampEn(time_series, m=m, r=r)
        return se[-1]  # SampEn at dimension m

    def compute_multiscale_entropy(time_series, m=2, r_factor=0.2, max_scale=20):
        """
        Compute multi-scale entropy.

        Returns array of SampEn values across scales.
        """
        mse, _ = EH.MSEn(
            time_series,
            Mobj=EH.MSobject('SampEn', m=m, r=r_factor * np.std(time_series)),
            Scales=max_scale
        )
        return mse

except ImportError:
    # フォールバック: 手動実装
    def compute_sample_entropy(time_series, m=2, r_factor=0.2):
        """Manual SampEn implementation (slower)."""
        N = len(time_series)
        r = r_factor * np.std(time_series)

        def count_matches(template_len):
            count = 0
            total = 0
            for i in range(N - template_len):
                for j in range(i + 1, N - template_len):
                    if max(abs(time_series[i:i+template_len] -
                               time_series[j:j+template_len])) <= r:
                        count += 1
                    total += 1
            return count / total if total > 0 else 0

        B = count_matches(m)
        A = count_matches(m + 1)

        if A == 0 or B == 0:
            return float('inf')

        return -np.log(A / B)
```

### 4.8 Node 2 統合

パイプラインの Node 2（Feature Engineering）において、センサー時系列データから SampEn を特徴量として抽出:

```typescript
interface NeuromotorFeatures {
  copSampEn: number;        // 重心動揺 SampEn
  jointAngleSampEn: number; // 関節角度変動 SampEn
  mseProfile: number[];     // 多スケールエントロピープロファイル
  complexityIndex: number;  // 複合複雑性指標
}
```

---

## モデル 5: Extended Kalman Filter for Decoupling Detection（デカップリング検出 EKF）

### 5.1 概要

拡張カルマンフィルタ（EKF: Extended Kalman Filter）を用いて、心肺系と筋骨格系の「デカップリング（非連動化）」を検出する。正常状態では負荷と心拍応答は密に連動するが、疲労・オーバートレーニング・傷害前兆ではこの連動が崩れる。この乖離をリアルタイムで検出する。

### 5.2 状態空間モデル

**状態ベクトル**:

```
x(t) = [HR(t), HRV(t), coupling(t), drift(t)]ᵀ
```

ここで:
- `HR(t)`: 心拍数
- `HRV(t)`: 心拍変動性（RMSSD）
- `coupling(t)`: 心肺-筋骨格カップリング係数
- `drift(t)`: カーディアック・ドリフト成分

**状態遷移モデル（非線形）**:

```
x(t+1) = f(x(t), u(t)) + w(t)
```

```
f(x, u) = | HR + α · (HR_target(u) − HR) + drift                    |
           | HRV + β · (HRV_baseline − HRV) − γ · |HR − HR_target|   |
           | coupling − δ · fatigue_accumulation(t)                    |
           | drift + ε · exercise_duration(t)                          |
```

ここで:
- `u(t)`: 外部入力（運動負荷、パワー出力等）
- `HR_target(u)`: 負荷レベルに対する期待心拍数
- `w(t) ~ N(0, Q)`: プロセスノイズ

**観測モデル**:

```
z(t) = h(x(t)) + v(t)
```

```
h(x) = | HR                        |
        | HRV                       |
        | coupling · workload        |
```

ここで `v(t) ~ N(0, R)` は観測ノイズ。

### 5.3 デカップリング検出判定

カップリング係数 `coupling(t)` の動態を監視:

```
decoupling_index(t) = 1 − coupling(t) / coupling_baseline
```

| Decoupling Index | 解釈 | 推奨アクション |
|-----------------|------|---------------|
| < 0.05 | 正常範囲 | トレーニング継続可 |
| 0.05 - 0.10 | 初期デカップリング | 強度調整推奨 |
| 0.10 - 0.20 | 有意なデカップリング | トレーニング中断検討 |
| > 0.20 | 重度デカップリング | 即座のトレーニング中断 |

### 5.4 EKF アルゴリズム

**予測ステップ**:

```
x̂(t|t-1) = f(x̂(t-1|t-1), u(t-1))
P(t|t-1) = F(t) · P(t-1|t-1) · F(t)ᵀ + Q
```

**更新ステップ**:

```
K(t) = P(t|t-1) · H(t)ᵀ · [H(t) · P(t|t-1) · H(t)ᵀ + R]⁻¹
x̂(t|t) = x̂(t|t-1) + K(t) · [z(t) − h(x̂(t|t-1))]
P(t|t) = [I − K(t) · H(t)] · P(t|t-1)
```

ここで:
- `F(t) = ∂f/∂x |_{x̂(t-1|t-1)}`: 状態遷移ヤコビアン
- `H(t) = ∂h/∂x |_{x̂(t|t-1)}`: 観測ヤコビアン
- `K(t)`: カルマンゲイン
- `P(t)`: 誤差共分散行列

### 5.5 ヤコビアン導出

**状態遷移ヤコビアン F**:

```
F = | 1−α    0      0    1 |
    | −γ·sgn 1−β    0    0 |
    | 0       0     1−δ'  0 |
    | 0       0      0    1 |
```

ここで `sgn = sign(HR − HR_target)`, `δ' = ∂(fatigue)/∂(coupling)`.

**観測ヤコビアン H**:

```
H = | 1    0    0          0 |
    | 0    1    0          0 |
    | 0    0    workload   0 |
```

### 5.6 イノベーション系列による異常検出

EKF のイノベーション（残差）系列を監視し、モデルからの逸脱を検出:

```
ν(t) = z(t) − h(x̂(t|t-1))
```

```
S(t) = H(t) · P(t|t-1) · H(t)ᵀ + R
```

正規化イノベーション二乗和（NIS）:

```
NIS(t) = ν(t)ᵀ · S(t)⁻¹ · ν(t)
```

`NIS(t) > χ²(n_z, 0.95)` の場合、有意な異常（デカップリング）を検出。

### 5.7 実装ノート

**ライブラリ**: FilterPy（カルマンフィルタ実装）

```python
import numpy as np
from filterpy.kalman import ExtendedKalmanFilter

class DecouplingEKF:
    """Extended Kalman Filter for cardiac-muscular decoupling detection."""

    def __init__(self, hr_baseline, hrv_baseline, coupling_baseline=1.0):
        self.ekf = ExtendedKalmanFilter(dim_x=4, dim_z=3)

        # 初期状態
        self.ekf.x = np.array([hr_baseline, hrv_baseline, coupling_baseline, 0.0])

        # 初期共分散
        self.ekf.P = np.diag([10.0, 5.0, 0.1, 0.01])

        # プロセスノイズ
        self.ekf.Q = np.diag([2.0, 1.0, 0.01, 0.001])

        # 観測ノイズ
        self.ekf.R = np.diag([5.0, 3.0, 2.0])

        # パラメータ
        self.alpha = 0.1   # HR 追従速度
        self.beta = 0.05   # HRV 回復速度
        self.gamma = 0.02  # HRV-HR 相互作用
        self.delta = 0.005 # 疲労によるカップリング低下
        self.epsilon = 0.001  # カーディアック・ドリフト速度

        self.hr_baseline = hr_baseline
        self.hrv_baseline = hrv_baseline
        self.coupling_baseline = coupling_baseline

    def state_transition(self, x, u):
        """Non-linear state transition function."""
        hr, hrv, coupling, drift = x
        workload, duration = u

        hr_target = self.hr_baseline + 0.5 * workload  # 簡易モデル

        hr_new = hr + self.alpha * (hr_target - hr) + drift
        hrv_new = hrv + self.beta * (self.hrv_baseline - hrv) - \
                  self.gamma * abs(hr - hr_target)
        coupling_new = coupling - self.delta * duration
        drift_new = drift + self.epsilon * duration

        return np.array([hr_new, hrv_new, coupling_new, drift_new])

    def observation_function(self, x, workload):
        """Non-linear observation function."""
        hr, hrv, coupling, drift = x
        return np.array([hr, hrv, coupling * workload])

    def compute_F(self, x, u):
        """Compute state transition Jacobian."""
        hr, hrv, coupling, drift = x
        workload, duration = u
        hr_target = self.hr_baseline + 0.5 * workload
        sgn = np.sign(hr - hr_target)

        F = np.array([
            [1 - self.alpha, 0, 0, 1],
            [-self.gamma * sgn, 1 - self.beta, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ])
        return F

    def compute_H(self, x, workload):
        """Compute observation Jacobian."""
        hr, hrv, coupling, drift = x
        H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, workload, 0]
        ])
        return H

    def update(self, measurement, workload, duration):
        """
        Run one EKF predict-update cycle.

        Parameters:
            measurement: [HR, HRV, HR_response_to_load]
            workload: current exercise intensity
            duration: cumulative exercise duration

        Returns:
            dict with state estimates and decoupling metrics
        """
        u = np.array([workload, duration])
        z = np.array(measurement)

        # Predict
        self.ekf.x = self.state_transition(self.ekf.x, u)
        F = self.compute_F(self.ekf.x, u)
        self.ekf.P = F @ self.ekf.P @ F.T + self.ekf.Q

        # Update
        H = self.compute_H(self.ekf.x, workload)
        z_pred = self.observation_function(self.ekf.x, workload)
        innovation = z - z_pred

        S = H @ self.ekf.P @ H.T + self.ekf.R
        K = self.ekf.P @ H.T @ np.linalg.inv(S)

        self.ekf.x = self.ekf.x + K @ innovation
        self.ekf.P = (np.eye(4) - K @ H) @ self.ekf.P

        # Normalized Innovation Squared
        nis = innovation.T @ np.linalg.inv(S) @ innovation

        # Decoupling index
        coupling = self.ekf.x[2]
        decoupling_index = 1 - coupling / self.coupling_baseline

        return {
            'state': {
                'hr': self.ekf.x[0],
                'hrv': self.ekf.x[1],
                'coupling': coupling,
                'cardiac_drift': self.ekf.x[3],
            },
            'decoupling_index': decoupling_index,
            'nis': nis,
            'anomaly_detected': nis > 7.81,  # chi2(3, 0.95)
            'innovation': innovation.tolist(),
            'risk_level': self._classify_decoupling(decoupling_index),
        }

    @staticmethod
    def _classify_decoupling(di):
        if di < 0.05:
            return 'NORMAL'
        elif di < 0.10:
            return 'EARLY_DECOUPLING'
        elif di < 0.20:
            return 'SIGNIFICANT_DECOUPLING'
        else:
            return 'SEVERE_DECOUPLING'
```

### 5.8 Node 2-3 統合

EKF はリアルタイム性が求められるため、Node 2 と Node 3 にまたがって動作する:

- **Node 2（Feature Engineering）**: EKF の状態推定値（coupling, drift, decoupling_index）を特徴量として抽出
- **Node 3（Inference Engine）**: デカップリング指標をベイジアン推論の入力として使用

```typescript
interface DecouplingFeatures {
  couplingCoefficient: number;
  decouplingIndex: number;
  cardiacDrift: number;
  nisValue: number;
  anomalyDetected: boolean;
  riskLevel: 'NORMAL' | 'EARLY_DECOUPLING' | 'SIGNIFICANT_DECOUPLING' | 'SEVERE_DECOUPLING';
}
```

---

## 付録: ヒアリング事項（Q1-Q5）

| ID | 質問 | 影響モデル |
|----|------|-----------|
| Q1 | Damage-Remodeling ODE のパラメータ較正に使用するデータソースは? | モデル 1 |
| Q2 | MRF の結合強度行列を個人レベルで適応させる方針は? | モデル 2 |
| Q3 | 応力集中テンソルの入力として利用可能なバイオメカニクスデータは?（モーションキャプチャ、フォースプレート等） | モデル 3 |
| Q4 | サンプルエントロピー計算のためのセンサーデータ（COP、IMU 等）の取得環境は? | モデル 4 |
| Q5 | EKF のリアルタイム処理要件（レイテンシ許容範囲、処理周期）は? | モデル 5 |

---

## ライブラリ依存関係サマリー

| モデル | 主要ライブラリ | バージョン要件 | 用途 |
|--------|-------------|--------------|------|
| 1: Damage-Remodeling ODE | SciPy | ≥ 1.10 | `solve_ivp` による ODE 数値積分 |
| 2: MRF Kinetic Chain | NetworkX | ≥ 3.0 | グラフ構造管理・隣接行列操作 |
| 3: Vulnerability Tensor | NumPy, SciPy | ≥ 1.24, ≥ 1.10 | テンソル計算・固有値分解 |
| 4: Sample Entropy | EntropyHub | ≥ 0.3 | SampEn・MSEn 高速計算 |
| 5: Decoupling EKF | FilterPy | ≥ 1.4 | 拡張カルマンフィルタ基盤 |
