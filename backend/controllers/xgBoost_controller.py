import xgboost as xgb
from sklearn.metrics import (
    accuracy_score, f1_score, confusion_matrix, classification_report,
    precision_score, recall_score, roc_auc_score, average_precision_score
)
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from data_service.data_service import data_service

# ============================================================
# 1. COLETA DE INDICADORES
# ============================================================
data_service.add_trend_primary(symbols="ETHUSDT", time="15m", mode="simulation")
data_service.add_trend(symbols="ETHUSDT", time="15m", mode="simulation")
data_service.add_vppr(modo="simulation", symbols="ETHUSDT", time="15m", accumulation_period="month")
data_service.add_rsi(mode="simulation", symbols="ETHUSDT", period=2, media_period=20)
data_service.add_price(mode="simulation", symbol="ETHUSDT", time="15m")

def normalize_data():
    return data_service.indicators_dataframe()

df = normalize_data()

print("Primeiras linhas do DataFrame:")
print(df.head())
print("\nColunas disponíveis:", df.columns.tolist())

# ============================================================
# 2. PREPARAÇÃO DAS FEATURES
# ============================================================
target_col = "trendPrice_TREND"

df.columns = df.columns.str.strip()

feature_cols = [
    c for c in df.columns
    if c not in [
        target_col,
        "close", "close_VPPR", "Volume", "Abertura", "Maximo", "Minimo",
        "Fechamento", "open", "symbol", "time", "volume",
        "macd", "macd_signal", "macd_histogram",
        "ema_fast", "ema_slow", "vppr_macd",
        "rsi_ma",
        'trendPrice_TREND_PRIMARY', 'limite_TREND_PRIMARY', 'type_TREND_PRIMARY',
        'trendPrice_TREND', "type_TREND",
        'ema_fast_TREND', 'ema_slow_TREND',
        'macd_TREND', 'macd_signal_TREND', 'macd_histogram_TREND',
        'rsi', 'limite_TREND', 'vppr', 'vppr_ema'
    ]
]

df = df.reset_index(drop=True)

print("\nFeatures usadas:", feature_cols)

# ============================================================
# 3. CRIAÇÃO DOS ALVOS DE REVERSÃO
# ============================================================
horizontes = [1, 2, 3, 4, 5, 6, 7,8]

mapa_direcao = {
    0: -1,  # Tendência Baixa
    1: 1,   # Tendência Alta
    2: -1,  # Reação Natural
    3: 1,   # Rally Natural
}

df["direcao_atual"] = df["type_TREND"].map(mapa_direcao)

for h in horizontes:
    # preço futuro em t+h (necessário para plotar)
    df[f"y_next_t{h}"] = df[target_col].shift(-h)

    # type_TREND futuro e direção futura
    df[f"type_futuro_t{h}"] = df["type_TREND"].shift(-h)
    df[f"direcao_futura_t{h}"] = df[f"type_futuro_t{h}"].map(mapa_direcao)

    # reversão: 1 se a direção futura é OPOSTA à atual
    # (NaN explícito onde não há dado futuro — não virar 0!)
    cond = (
        df["direcao_atual"].notna() &
        df[f"direcao_futura_t{h}"].notna()
    )
    reversao = pd.Series(np.nan, index=df.index)
    reversao[cond] = (
        df.loc[cond, "direcao_atual"] != df.loc[cond, f"direcao_futura_t{h}"]
    ).astype(int)
    df[f"y_reversao_t{h}"] = reversao

# remove NaN apenas do alvo de preço / direção atual
df = df.dropna(subset=[target_col, "direcao_atual"]).reset_index(drop=True)

print("\nTotal de linhas após limpeza:", len(df))
print("\nDistribuição de reversão por horizonte (apenas onde há alvo):")
for h in horizontes:
    col = f"y_reversao_t{h}"
    dist = df[col].dropna().value_counts(normalize=True).sort_index()
    n_valid = df[col].notna().sum()
    print(f"  t+{h}: {dist.to_dict()}  (n válidos = {n_valid})")

# ============================================================
# 4. SPLIT TEMPORAL (base)
# ============================================================
split_base = int(len(df) * 0.8)
X = df[feature_cols]

print(f"\nSplit base: treino até {split_base} | teste de {split_base} em diante")
print(f"Total: {len(df)} linhas")

# ============================================================
# 5. FUNÇÕES AUXILIARES
# ============================================================
def make_classifier(n_classes, scale_pos_weight=1):
    if n_classes == 2:
        return xgb.XGBClassifier(
            n_estimators=3000,
            max_depth=4,
            learning_rate=0.01,
            subsample=0.7,
            colsample_bytree=0.7,
            gamma=1,
            reg_alpha=0.1,
            reg_lambda=1,
            scale_pos_weight=scale_pos_weight,
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )
    else:
        return xgb.XGBClassifier(
            n_estimators=3000,
            max_depth=4,
            learning_rate=0.01,
            subsample=0.7,
            colsample_bytree=0.7,
            gamma=1,
            reg_alpha=0.1,
            reg_lambda=1,
            objective="multi:softprob",
            num_class=n_classes,
            eval_metric="mlogloss",
            random_state=42,
            n_jobs=-1,
        )


# mapa fixo — nunca recalcular por horizonte
MAPA_FIXO = {0.0: 0, 1.0: 1}


def avaliar_reversao(h):
    """
    Treina classificador para prever se trendPrice_TREND vai INVERTER
    de direção em t+h, respeitando o horizonte para evitar vazamento.
    """
    col_alvo = f"y_reversao_t{h}"
    y = df[col_alvo]

    # ---- split temporal respeitando o horizonte ----
    split_treino = split_base - h   # garante que alvo do treino não invade teste
    split_teste  = split_base

    if split_treino <= 0:
        print(f"\n⚠️  t+{h}: split_treino inválido — pulando.")
        return None

    y_train_raw = y.iloc[:split_treino]
    y_test_raw  = y.iloc[split_teste:]

    X_train_h = X.iloc[:split_treino]
    X_test_h  = X.iloc[split_teste:]

    # ---- limpa NaN no treino (alvo desconhecido) ----
    mask_train = y_train_raw.notna()
    X_train_h = X_train_h[mask_train.values]
    y_train_raw = y_train_raw[mask_train]

    # ---- limpa NaN no teste ----
    mask_test = y_test_raw.notna()
    X_test_h = X_test_h[mask_test.values]
    y_test_raw = y_test_raw[mask_test]

    if y_train_raw.nunique() < 2:
        print(f"\n⚠️  t+{h}: só 1 classe no treino ({y_train_raw.unique()}) — pulando.")
        return None
    if len(y_test_raw) == 0:
        print(f"\n⚠️  t+{h}: teste vazio — pulando.")
        return None
    if y_test_raw.nunique() < 2:
        print(f"\n⚠️  t+{h}: só 1 classe no teste — métricas de AUC indefinidas, mas seguindo.")

    # ---- mapa FIXO ----
    y_train = y_train_raw.map(MAPA_FIXO).astype(int)
    y_test  = y_test_raw.map(MAPA_FIXO).astype(int)

    # ---- scale_pos_weight ----
    n_pos = (y_train == 1).sum()
    n_neg = (y_train == 0).sum()
    scale = n_neg / n_pos if n_pos > 0 else 1.0

    # ---- treino ----
    model = make_classifier(2, scale_pos_weight=scale)
    model.fit(X_train_h, y_train)

    pred = model.predict(X_test_h)
    proba = model.predict_proba(X_test_h)[:, 1]

    # ---- métricas ----
    try:
        auc = roc_auc_score(y_test, proba) if y_test.nunique() > 1 else float("nan")
    except Exception:
        auc = float("nan")

    try:
        pr_auc = average_precision_score(y_test, proba) if y_test.nunique() > 1 else float("nan")
    except Exception:
        pr_auc = float("nan")

    acc    = accuracy_score(y_test, pred)
    prec_1 = precision_score(y_test, pred, pos_label=1, zero_division=0)
    rec_1  = recall_score(y_test, pred, pos_label=1, zero_division=0)
    f1_1   = f1_score(y_test, pred, pos_label=1, zero_division=0)
    f1m    = f1_score(y_test, pred, average="macro", zero_division=0)

    # baselines
    baseline_naive = np.zeros(len(y_test), dtype=int)
    acc_naive = accuracy_score(y_test, baseline_naive)
    f1m_naive = f1_score(y_test, baseline_naive, average="macro", zero_division=0)

    classe_maj = int(y_train.mode()[0])
    baseline_maj = np.full(len(y_test), classe_maj, dtype=int)
    acc_maj = accuracy_score(y_test, baseline_maj)
    f1m_maj = f1_score(y_test, baseline_maj, average="macro", zero_division=0)

    cm = confusion_matrix(y_test, pred)

    print(f"\n{'='*60}")
    print(f"HORIZONTE t+{h} — REVERSÃO")
    print(f"{'='*60}")
    print(f"Treino: {len(y_train)} | Teste: {len(y_test)}")
    print(f"Dist. treino: {y_train.value_counts(normalize=True).sort_index().to_dict()}")
    print(f"Dist. teste:  {y_test.value_counts(normalize=True).sort_index().to_dict()}")
    print(f"scale_pos_weight = {scale:.4f}")
    print(f"  Acc modelo:                 {acc:.4f}")
    print(f"  Acc baseline (naive cont.): {acc_naive:.4f}  |  gap = {acc - acc_naive:+.4f}")
    print(f"  Acc baseline (majoritária): {acc_maj:.4f}")
    print(f"  AUC:      {auc:.4f}")
    print(f"  PR-AUC:   {pr_auc:.4f}")
    print(f"  === CLASSE 1 (REVERSÃO) ===")
    print(f"  Precision: {prec_1:.4f}")
    print(f"  Recall:    {rec_1:.4f}")
    print(f"  F1:        {f1_1:.4f}")
    print(f"  F1 macro:  {f1m:.4f}  (naive: {f1m_naive:.4f} | maj: {f1m_maj:.4f})")
    print(f"\nMatriz de confusão:\n{cm}")
    print("\nClassification report:")
    print(classification_report(y_test, pred, digits=4, zero_division=0))

    return {
        "h": h,
        "acc": acc, "auc": auc, "pr_auc": pr_auc,
        "prec_1": prec_1, "rec_1": rec_1, "f1_1": f1_1, "f1_macro": f1m,
        "acc_baseline_naive": acc_naive,
        "acc_baseline_maj": acc_maj,
        "f1_baseline_naive": f1m_naive,
        "f1_baseline_maj": f1m_maj,
        "gap_acc_naive": acc - acc_naive,
        "matriz_confusao": cm,
        "model": model,
        "pred": pred,
        "proba": proba,
        "y_test": y_test,
        "n_train": len(y_train),
        "n_test": len(y_test),
    }


# ============================================================
# 6. LOOP NOS HORIZONTES
# ============================================================
resultados = []
for h in horizontes:
    res = avaliar_reversao(h)
    if res is not None:
        resultados.append(res)

# ============================================================
# 7. TABELA RESUMO
# ============================================================
mudancas = (df["type_TREND"].shift(1) != df["type_TREND"]).mean()
print(f"\nTaxa de mudança de type_TREND: {mudancas:.2%}")

print("\n\n" + "="*110)
print("RESUMO — REVERSÃO DO trendPrice_TREND POR HORIZONTE")
print("="*110)

tabela = []
for r in resultados:
    tabela.append({
        "Horizonte":     f"t+{r['h']}",
        "n_train":       r["n_train"],
        "n_test":        r["n_test"],
        "Acc modelo":    round(r["acc"], 4),
        "Acc naive":     round(r["acc_baseline_naive"], 4),
        "Gap acc":       round(r["gap_acc_naive"], 4),
        "AUC":           round(r["auc"], 4),
        "PR-AUC":        round(r["pr_auc"], 4),
        "Prec_1":        round(r["prec_1"], 4),
        "Rec_1":         round(r["rec_1"], 4),
        "F1_1":          round(r["f1_1"], 4),
        "F1 macro":      round(r["f1_macro"], 4),
    })

if tabela:
    df_resumo = pd.DataFrame(tabela)
    print(df_resumo.to_string(index=False))
else:
    print("Nenhum horizonte produziu resultado válido.")

# ============================================================
# 8. VISUALIZAÇÃO — MÉTRICAS vs HORIZONTE
# ============================================================
if resultados:
    fig, ax = plt.subplots(figsize=(11, 6))

    hs         = [r["h"] for r in resultados]
    accs       = [r["acc"] for r in resultados]
    accs_naive = [r["acc_baseline_naive"] for r in resultados]
    aucs       = [r["auc"] for r in resultados]
    pr_aucs    = [r["pr_auc"] for r in resultados]
    prec_1     = [r["prec_1"] for r in resultados]
    rec_1      = [r["rec_1"] for r in resultados]
    f1_1       = [r["f1_1"] for r in resultados]

    ax.plot(hs, accs,       marker="o", label="Acurácia modelo", linewidth=2)
    ax.plot(hs, accs_naive, marker="s", label="Acurácia naive (não reverte)", linewidth=2, linestyle="--")
    ax.plot(hs, aucs,       marker="P", label="AUC", linewidth=2, linestyle="-")
    ax.plot(hs, pr_aucs,    marker="X", label="PR-AUC", linewidth=2, linestyle="-")
    ax.plot(hs, prec_1,     marker="^", label="Precision classe 1", linewidth=1.5, linestyle=":")
    ax.plot(hs, rec_1,      marker="v", label="Recall classe 1", linewidth=1.5, linestyle="-.")
    ax.plot(hs, f1_1,       marker="D", label="F1 classe 1", linewidth=1.5)

    ax.axhline(0.5, color="gray", alpha=0.3, linestyle=":", label="AUC = 0.5 (aleatório)")

    ax.set_xlabel("Horizonte (t+h)")
    ax.set_ylabel("Métrica")
    ax.set_title("Reversão do trendPrice_TREND — desempenho por horizonte")
    ax.set_xticks(hs)
    ax.set_ylim(0, 1.05)
    ax.legend(loc="best", fontsize=9)
    ax.grid(alpha=0.3)

    plt.tight_layout()
    plt.show()

# ============================================================
# 9. VISUALIZAÇÃO — REVERSÃO REAL vs PREVISTA
# ============================================================
horizontes_para_plotar = [1, 2, 3, 5,6,7,8]
resultados_plot = [r for r in resultados if r["h"] in horizontes_para_plotar]

for r in resultados_plot:
    h = r["h"]
    pred    = r["pred"]
    y_real  = r["y_test"].values

    fig, axes = plt.subplots(2, 1, figsize=(15, 7), sharex=True)

    # painel 1: reversões reais vs previstas
    axes[0].plot(y_real, label="Reversão real", alpha=0.7, linewidth=1)
    axes[0].plot(pred,   label="Reversão prevista", alpha=0.7, linewidth=1, linestyle="--")
    axes[0].set_yticks([0, 1])
    axes[0].set_yticklabels(["Continua", "Reverte"])
    axes[0].set_title(
        f"t+{h} | acc={r['acc']:.4f} | auc={r['auc']:.4f} | "
        f"prec_1={r['prec_1']:.4f} | rec_1={r['rec_1']:.4f}"
    )
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # painel 2: erro acumulado vs baseline aleatório
    erro = (y_real != pred).astype(int)
    # baseline: erro esperado de um classificador aleatório que acerta na taxa base
    taxa_erro_esperada = min(y_real.mean(), 1 - y_real.mean())
    erro_acum = np.cumsum(erro - taxa_erro_esperada)

    axes[1].plot(erro_acum, color="purple", alpha=0.8, linewidth=1.2)
    axes[1].axhline(0, color="black", linestyle="--", alpha=0.5,
                    label=f"baseline (taxa erro={taxa_erro_esperada:.3f})")
    axes[1].set_title("Erro acumulado (viés) vs baseline")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.show()

# ============================================================
# 10. VISUALIZAÇÃO — REVERSÃO COM PREÇO
# ============================================================
for r in resultados_plot:
    h = r["h"]
    idx = r["y_test"].index.values
    pred   = r["pred"]
    y_real = r["y_test"].values

    preco_real_h = df[f"y_next_t{h}"].values[idx]

    fig, axes = plt.subplots(2, 1, figsize=(15, 8), sharex=True)

    # painel 1: preço com marcações
    axes[0].plot(preco_real_h, color="black", alpha=0.5, linewidth=1,
                 label=f"trendPrice t+{h}")

    idx_rev_real = np.where(y_real == 1)[0]
    axes[0].scatter(idx_rev_real, preco_real_h[idx_rev_real],
                    color="orange", s=20, alpha=0.7, label="Reversão real")

    idx_rev_pred = np.where(pred == 1)[0]
    axes[0].scatter(idx_rev_pred, preco_real_h[idx_rev_pred],
                    color="blue", s=10, alpha=0.5, marker="x", label="Reversão prevista")

    axes[0].set_title(
        f"t+{h} | prec_1={r['prec_1']:.4f} | rec_1={r['rec_1']:.4f} | auc={r['auc']:.4f}"
    )
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # painel 2: reversão real vs prevista (0/1)
    axes[1].plot(y_real, label="Real", alpha=0.7, linewidth=1)
    axes[1].plot(pred,   label="Previsto", alpha=0.7, linewidth=1, linestyle="--")
    axes[1].set_yticks([0, 1])
    axes[1].set_yticklabels(["Continua", "Reverte"])
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.show()