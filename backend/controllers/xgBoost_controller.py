import xgboost as xgb
from sklearn.metrics import (
    accuracy_score, f1_score, confusion_matrix, classification_report
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
#data_service.add_rsi(mode="simulation", symbols="ETHUSDT", period=2, media_period=20)
data_service.add_rsi_primary(mode="simulation", symbols="ETHUSDT", period=10, media_period=20)
data_service.add_price(mode="simulation", symbol="ETHUSDT", time="15m")
data_service.add_Schrodinger(modo="simulation", symbols="ETHUSDT", time="15m", accumulation_period="month")

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

# Guard clause para evitar execução sem dados
if df is None or df.empty:
    print("⚠️ Nenhum dado disponível no DataFrame. Encerrando execução.")
    exit()

# limpa nomes ANTES de montar feature_cols
df.columns = df.columns.str.strip()

exclude_cols = {
    target_col,
    "close", "close_VPPR", "Volume", "Abertura", "Maximo", "Minimo",
    "Fechamento", "open", "symbol", "time", "volume",
    "macd", "macd_signal", "macd_histogram",
    "vppr_macd", "rsi_ma",'vppr', 'vppr_ema', 'rsi',
    "trendPrice_TREND_PRIMARY", "limite_TREND_PRIMARY",'rsi_ma_primary',
    "type_TREND",'wave_function','schrodinger_H', 'schrodinger_potencial','rsi_primary',
    "ema_fast_TREND", "ema_slow_TREND",'vppr_signal','type_TREND_PRIMARY','schrodinger_buy', 'schrodinger_sell',
    "macd_TREND", "macd_signal_TREND", "macd_histogram_TREND", 'ema_TREND','limite_TREND'
}

feature_cols = [c for c in df.columns if c not in exclude_cols]

df = df.reset_index(drop=True)

print(df[["time","rsi_primary_signal", "Fechamento"]].head(20))
print(f"\nFeatures usadas ({len(feature_cols)}): {feature_cols}")

# ============================================================
# 3. CRIAÇÃO DOS ALVOS t+1 ... t+7
# ============================================================
horizontes = [1, 2, 3]

for h in horizontes:
    df.loc[:, f"y_next_t{h}"] = df[target_col].shift(-h)

    # 1 = subiu, 0 = caiu, NaN = ficou igual (será removido no dropna)
    df.loc[:, f"y_dir_t{h}"] = np.where(
        df[f"y_next_t{h}"] > df[target_col], 1,
        np.where(df[f"y_next_t{h}"] < df[target_col], 0, np.nan)
    )

cols_alvo = [f"y_dir_t{h}" for h in horizontes] + [f"y_next_t{h}" for h in horizontes]
df = df.dropna(subset=[target_col] + cols_alvo).reset_index(drop=True)

print("\nTotal de linhas após limpeza:", len(df))

# ============================================================
# 4. SPLIT TEMPORAL
# ============================================================
split = int(len(df) * 0.8)

X = df[feature_cols]
X_train, X_test = X.iloc[:split], X.iloc[split:]

print(f"\nTreino: {len(X_train)} | Teste: {len(X_test)}")

# ============================================================
# 5. FUNÇÃO DE AVALIAÇÃO POR HORIZONTE
# ============================================================
def avaliar_horizonte(h):
    col_dir = f"y_dir_t{h}"
    y_dir = df[col_dir]

    y_train_raw = y_dir.iloc[:split]
    y_test_raw  = y_dir.iloc[split:]

    classes_treino = sorted(y_train_raw.dropna().unique())
    if len(classes_treino) < 2:
        print(f"\n⚠️  t+{h}: apenas 1 classe no treino — pulando.")
        return None

    mapa = {c: i for i, c in enumerate(classes_treino)}
    n_classes = len(mapa)

    y_train = y_train_raw.map(mapa)
    y_test  = y_test_raw.map(mapa)

    mask_train = y_train.notna()
    mask_test  = y_test.notna()

    y_train = y_train[mask_train].astype(int)
    X_train_h = X_train.loc[mask_train]

    y_test = y_test[mask_test].astype(int)
    X_test_h = X_test.loc[mask_test]

    if len(y_test) == 0:
        print(f"\n⚠️  t+{h}: nenhuma amostra válida no teste — pulando.")
        return None

    # --- balanceamento ---
    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    scale_pos_weight = n_neg / max(n_pos, 1)

    print(f"t+{h} | treino → 0: {n_neg} | 1: {n_pos} | scale_pos_weight = {scale_pos_weight:.2f}")

    # validação temporal
    val_size = max(int(len(X_train_h) * 0.2), 50)
    X_tr, X_val = X_train_h.iloc[:-val_size], X_train_h.iloc[-val_size:]
    y_tr, y_val = y_train.iloc[:-val_size], y_train.iloc[-val_size:]

    dtrain = xgb.DMatrix(X_tr, label=y_tr)
    dval   = xgb.DMatrix(X_val, label=y_val)
    dtest  = xgb.DMatrix(X_test_h)

    params = {
        "max_depth": 3,
        "learning_rate": 0.02,
        "subsample": 0.6,
        "colsample_bytree": 0.6,
        "min_child_weight": 5,
        "gamma": 1.0,
        "reg_alpha": 0.5,
        "reg_lambda": 1.5,
        "random_state": 42,
        "verbosity": 0,
    }

    if n_classes == 2:
        params["objective"] = "binary:logistic"
        params["eval_metric"] = "logloss"
        params["scale_pos_weight"] = scale_pos_weight
    else:
        params["objective"] = "multi:softprob"
        params["eval_metric"] = "mlogloss"
        params["num_class"] = n_classes

    model = xgb.train(
        params,
        dtrain,
        num_boost_round=2500,
        evals=[(dval, "validation")],
        early_stopping_rounds=100,
        verbose_eval=False,
    )

    print(f"t+{h} | best_iteration = {model.best_iteration}")

    # --- melhor threshold na validação ---
    if n_classes == 2:
        val_proba = model.predict(dval, iteration_range=(0, model.best_iteration + 1))
        best_thr, best_f1 = 0.5, 0.0
        for thr in np.linspace(0.15, 0.85, 29):
            pred_val = (val_proba > thr).astype(int)
            f1 = f1_score(y_val, pred_val, average="macro", zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_thr = thr
        print(f"t+{h} | melhor threshold = {best_thr:.3f} | F1 val = {best_f1:.4f}")

        pred_proba = model.predict(dtest, iteration_range=(0, model.best_iteration + 1))
        pred = (pred_proba > best_thr).astype(int)
    else:
        pred_proba = model.predict(dtest, iteration_range=(0, model.best_iteration + 1))
        pred = np.argmax(pred_proba, axis=1)

    # baseline
    classe_maj = y_train.mode()[0]
    baseline = np.full(len(y_test), classe_maj)

    acc   = accuracy_score(y_test, pred)
    f1m   = f1_score(y_test, pred, average="macro", zero_division=0)
    acc_b = accuracy_score(y_test, baseline)
    f1m_b = f1_score(y_test, baseline, average="macro", zero_division=0)

    cm = confusion_matrix(y_test, pred)

    resultado = {
        "h": h,
        "n_classes": n_classes,
        "mapa": mapa,
        "acc": acc,
        "f1_macro": f1m,
        "acc_baseline": acc_b,
        "f1_baseline": f1m_b,
        "gap_acc": acc - acc_b,
        "gap_f1": f1m - f1m_b,
        "matriz_confusao": cm,
        "model": model,
        "pred": pred,
        "y_test": y_test,
        "bateu_baseline": (acc > acc_b) and (f1m > f1m_b),
        "best_iteration": model.best_iteration,
    }

    print(f"\n{'='*60}")
    print(f"HORIZONTE t+{h}")
    print(f"{'='*60}")
    print(f"Acurácia:  modelo = {acc:.4f}  |  baseline = {acc_b:.4f}  |  gap = {acc - acc_b:+.4f}")
    print(f"F1 macro:  modelo = {f1m:.4f}  |  baseline = {f1m_b:.4f}  |  gap = {f1m - f1m_b:+.4f}")
    print(f"Bateu baseline? {'✅ SIM' if resultado['bateu_baseline'] else '❌ NÃO'}")
    print("\nMatriz de confusão:")
    print(cm)
    print(classification_report(y_test, pred, digits=4, zero_division=0))

    return resultado

# ============================================================
# 6. LOOP NOS HORIZONTES
# ============================================================
resultados = []
for h in horizontes:
    res = avaliar_horizonte(h)
    if res is not None:
        resultados.append(res)

# ============================================================
# 7. TABELA RESUMO
# ============================================================
print("\n\n" + "=" * 80)
print("RESUMO — DIREÇÃO POR HORIZONTE")
print("=" * 80)

tabela = []
for r in resultados:
    tabela.append({
        "Horizonte": f"t+{r['h']}",
        "N classes": r["n_classes"],
        "Acc modelo": r["acc"],
        "Acc baseline": r["acc_baseline"],
        "Gap acc": r["gap_acc"],
        "F1 modelo": r["f1_macro"],
        "F1 baseline": r["f1_baseline"],
        "Gap F1": r["gap_f1"],
        "Bateu?": "✅" if r["bateu_baseline"] else "❌",
        "Best iter": r["best_iteration"],
    })

df_resumo = pd.DataFrame(tabela)
print(df_resumo.to_string(index=False))

# ============================================================
# 8. VISUALIZAÇÃO — ACURÁCIA vs HORIZONTE
# ============================================================
fig, ax = plt.subplots(figsize=(10, 5))

hs = [r["h"] for r in resultados]
accs = [r["acc"] for r in resultados]
accs_b = [r["acc_baseline"] for r in resultados]
f1s = [r["f1_macro"] for r in resultados]

ax.plot(hs, accs, marker="o", label="Model accuracy", linewidth=2)
ax.plot(hs, accs_b, marker="s", label="Baseline accuracy", linewidth=2, linestyle="--")
ax.plot(hs, f1s, marker="^", label="F1 macro model", linewidth=2, linestyle=":")

ax.set_xlabel("Horizon (t+h)")
ax.set_ylabel("Metric")
ax.set_title("Performance by horizon — direction")
ax.set_xticks(hs)
ax.legend()
ax.grid(alpha=0.3)

plt.tight_layout()
plt.show()

# ============================================================
# 9. VISUALIZAÇÃO MELHORADA — DIAGNÓSTICO POR HORIZONTE
# ============================================================
from sklearn.metrics import roc_curve, auc, precision_recall_curve, ConfusionMatrixDisplay

horizontes_para_plotar = [1, 2, 3]
resultados_plot = [r for r in resultados if r["h"] in horizontes_para_plotar]

preco_full = df[target_col].values

for r in resultados_plot:
    h = r["h"]
    idx        = r["y_test"].index.values
    y_real     = r["y_test"].values
    pred       = r["pred"]
    preco_t    = preco_full[idx]
    preco_real_h = df[f"y_next_t{h}"].values[idx]
    acertos    = (pred == y_real)

    fig = plt.figure(figsize=(16, 11))
    gs  = fig.add_gridspec(3, 3, height_ratios=[1.1, 1.0, 1.0], hspace=0.35, wspace=0.25)

    # ---------- PAINEL 1: preço real com fundo colorido por acerto/erro ----------
    ax0 = fig.add_subplot(gs[0, :])
    ax0.plot(preco_real_h, color="black", linewidth=1.0, label=f"Actual price t+{h}", zorder=3)

    # faixas de fundo: verde = acertou, vermelho claro = errou
    erro_bool = (~acertos).astype(int)
    ax0.fill_between(
        np.arange(len(preco_real_h)), 
        preco_real_h.min(), preco_real_h.max(),
        where=erro_bool == 1, color="red", alpha=0.15, step="mid", label="Erro"
    )
    ax0.set_title(f"t+{h} — Actual price t+{h} (red bands = steering errors)  |  acc = {r['acc']:.3f}  (baseline {r['acc_baseline']:.3f})")
    ax0.set_ylabel("Price")
    ax0.legend(loc="upper left")
    ax0.grid(alpha=0.25)

    # ---------- PAINEL 2: matriz de confusão ----------
    ax1 = fig.add_subplot(gs[1, 0])
    ConfusionMatrixDisplay.from_predictions(
        y_real, pred,
        display_labels=["Low", "High"],
        cmap="Blues", ax=ax1, colorbar=False, values_format="d",
    )
    ax1.set_title(f"Confusion matrix — t+{h}")

    # ---------- PAINEL 3: curva ROC / PR ----------
    ax2 = fig.add_subplot(gs[1, 1])
    if hasattr(r["model"], "predict") and r["n_classes"] == 2:
        dtest_h = xgb.DMatrix(X_test.loc[idx])
        proba = r["model"].predict(dtest_h, iteration_range=(0, r["model"].best_iteration + 1))
        fpr, tpr, _ = roc_curve(y_real, proba)
        roc_auc = auc(fpr, tpr)
        ax2.plot(fpr, tpr, label=f"ROC (AUC = {roc_auc:.3f})", linewidth=2)
        ax2.plot([0, 1], [0, 1], "k--", alpha=0.4)
        ax2.set_title("Curve ROC")
        ax2.set_xlabel("FPR"); ax2.set_ylabel("TPR")
        ax2.legend(); ax2.grid(alpha=0.25)
    else:
        ax2.text(0.5, 0.5, "ROC unavailable\n(multiclasse)", ha="center", va="center")
        ax2.axis("off")

    # ---------- PAINEL 4: distribuição da confiança das predições ----------
    ax3 = fig.add_subplot(gs[1, 2])
    if r["n_classes"] == 2:
        dtest_h = xgb.DMatrix(X_test.loc[idx])
        proba = r["model"].predict(dtest_h, iteration_range=(0, r["model"].best_iteration + 1))
        ax3.hist(proba[acertos],  bins=30, alpha=0.7, color="green", label="Acerto")
        ax3.hist(proba[~acertos], bins=30, alpha=0.7, color="red",   label="Erro")
        ax3.axvline(0.5, color="black", linestyle="--", alpha=0.5)
        ax3.set_title("Confidence distribution (proba)")
        ax3.set_xlabel("P(high)"); ax3.set_ylabel("Frequency")
        ax3.legend(); ax3.grid(alpha=0.25)
    else:
        ax3.axis("off")

    # ---------- PAINEL 5: acurácia acumulada (janela) ----------
    ax4 = fig.add_subplot(gs[2, :])
    janela = max(50, len(acertos) // 20)
    acc_rol = pd.Series(acertos.astype(float)).rolling(janela, min_periods=janela // 2).mean()
    ax4.plot(acc_rol.values, color="teal", linewidth=1.5, label=f"Rolling accuracy (janela={janela})")
    ax4.axhline(r["acc_baseline"], color="orange", linestyle="--", label=f"Baseline ({r['acc_baseline']:.3f})")
    ax4.axhline(r["acc"], color="teal", linestyle=":", alpha=0.6, label=f"Overall accuracy ({r['acc']:.3f})")
    ax4.set_ylim(0, 1)
    ax4.set_title("Accuracy accumulated over the test duration")
    ax4.set_xlabel("Index (time)"); ax4.set_ylabel("Accuracy")
    ax4.legend(); ax4.grid(alpha=0.25)

    plt.suptitle(f"Diagnosis t+{h}", fontsize=14, y=0.995)
    plt.show()


# ============================================================
# 10. IMPORTÂNCIA DE FEATURES (top 15 por horizonte)
# ============================================================
fig, axes = plt.subplots(1, len(resultados_plot), figsize=(5 * len(resultados_plot), 6), sharey=False)

if len(resultados_plot) == 1:
    axes = [axes]

for ax, r in zip(axes, resultados_plot):
    model = r["model"]
    score = model.get_score(importance_type="gain")
    if not score:
        ax.text(0.5, 0.5, "unimportant", ha="center")
        ax.axis("off"); continue

    top = sorted(score.items(), key=lambda x: x[1], reverse=True)[:15]
    names = [k for k, _ in top][::-1]
    vals  = [v for _, v in top][::-1]

    ax.barh(names, vals, color="steelblue")
    ax.set_title(f"Top 15 features — t+{r['h']}")
    ax.set_xlabel("Gain")
    ax.grid(alpha=0.25, axis="x")

plt.tight_layout()
plt.show()


# ============================================================
# 11. COMPARAÇÃO GLOBAL — baseline vs modelo (todos horizontes)
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

hs_     = [r["h"] for r in resultados]
gap_acc = [r["gap_acc"] for r in resultados]
gap_f1  = [r["gap_f1"]  for r in resultados]

cores_acc = ["#2ca02c" if g > 0 else "#d62728" for g in gap_acc]
cores_f1  = ["#2ca02c" if g > 0 else "#d62728" for g in gap_f1]

axes[0].bar([f"t+{h}" for h in hs_], gap_acc, color=cores_acc)
axes[0].axhline(0, color="black", linewidth=1)
axes[0].set_title("Accuracy gap (model − baseline)")
axes[0].set_ylabel("Δ accuracy")
axes[0].grid(alpha=0.25, axis="y")

axes[1].bar([f"t+{h}" for h in hs_], gap_f1, color=cores_f1)
axes[1].axhline(0, color="black", linewidth=1)
axes[1].set_title("Macro F1 gap (model − baseline)")
axes[1].set_ylabel("Δ F1")
axes[1].grid(alpha=0.25, axis="y")

plt.tight_layout()
plt.show()


# ============================================================
# 12. PREÇO REAL vs PREVISTO — versão honesta
# ============================================================
# Em vez de "escada" com mov_alta/mov_baixa fixos, mostramos
# o retorno real t→t+h versus o retorno "esperado" pelo modelo,
# separado por classe prevista. Assim você vê a separação real.
for r in resultados_plot:
    h     = r["h"]
    idx   = r["y_test"].index.values
    pred  = r["pred"]
    y_real = r["y_test"].values

    preco_t      = preco_full[idx]
    preco_real_h = df[f"y_next_t{h}"].values[idx]
    retorno_real = (preco_real_h - preco_t) / preco_t * 100  # %

    fig, axes = plt.subplots(1, 2, figsize=(15, 5), gridspec_kw={"width_ratios": [2, 1]})

    # --- Esquerda: retorno real vs direção prevista ---
    ax = axes[0]
    ax.scatter(np.arange(len(retorno_real))[pred == 1], retorno_real[pred == 1],
               s=8, alpha=0.5, color="green", label="Expected: HIGH")
    ax.scatter(np.arange(len(retorno_real))[pred == 0], retorno_real[pred == 0],
               s=8, alpha=0.5, color="red", label="Expected: LOW")
    ax.axhline(0, color="black", linewidth=1)
    ax.set_title(f"t+{h} — Real return t→t+{h} separated by designated class")
    ax.set_xlabel("Index (time)"); ax.set_ylabel("Real return (%)")
    ax.legend(); ax.grid(alpha=0.25)

    # --- Direita: distribuição de retorno por classe prevista ---
    ax = axes[1]
    ax.hist(retorno_real[pred == 1], bins=40, alpha=0.6, color="green", label="Expected: HIGH",  density=True)
    ax.hist(retorno_real[pred == 0], bins=40, alpha=0.6, color="red",   label="Expected: LOW", density=True)
    ax.axvline(0, color="black", linewidth=1)
    ax.set_title(f"t+{h} — Distribution of real returns\nby predicted class")
    ax.set_xlabel("Real return (%)"); ax.set_ylabel("Density")
    ax.legend(); ax.grid(alpha=0.25)

    plt.tight_layout()
    plt.show()