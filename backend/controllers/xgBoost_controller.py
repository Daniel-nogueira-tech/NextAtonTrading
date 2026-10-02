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
data_service.add_rsi(mode="simulation", symbols="ETHUSDT", period=2, media_period=20)
data_service.add_price(mode="simulation", symbol="ETHUSDT", time="15m")

def normalize_data():
    print('',data_service.indicators_dataframe())
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
   "vppr_macd", "rsi_ma",
    "trendPrice_TREND_PRIMARY", "limite_TREND_PRIMARY", "type_TREND_PRIMARY",
    "type_TREND",
    "ema_fast_TREND", "ema_slow_TREND",
    "macd_TREND", "macd_signal_TREND", "macd_histogram_TREND", 'ema_TREND','limite_TREND'
    # colunas potencialmente perigosas / redundantes — revise se quiser manter alguma

}

feature_cols = [c for c in df.columns if c not in exclude_cols]

df = df.reset_index(drop=True)

print(df[["time", "Fechamento", "close_VPPR", "trendPrice_TREND_PRIMARY", "type_TREND_PRIMARY", "vppr_signal"]].head(20))
print(f"\nFeatures usadas ({len(feature_cols)}): {feature_cols}")

# ============================================================
# 3. CRIAÇÃO DOS ALVOS t+1 ... t+7
# ============================================================
horizontes = [1, 2, 3, 4, 5, 6]

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

ax.plot(hs, accs, marker="o", label="Acurácia modelo", linewidth=2)
ax.plot(hs, accs_b, marker="s", label="Acurácia baseline", linewidth=2, linestyle="--")
ax.plot(hs, f1s, marker="^", label="F1 macro modelo", linewidth=2, linestyle=":")

ax.set_xlabel("Horizonte (t+h)")
ax.set_ylabel("Métrica")
ax.set_title("Desempenho por horizonte — direção")
ax.set_xticks(hs)
ax.legend()
ax.grid(alpha=0.3)

plt.tight_layout()
plt.show()

# ============================================================
# 9. VISUALIZAÇÃO — DIREÇÃO PREVISTA vs REAL
# ============================================================
horizontes_para_plotar = [1, 2, 3, 6]
resultados_plot = [r for r in resultados if r["h"] in horizontes_para_plotar]

preco_full = df[target_col].values

for r in resultados_plot:
    h = r["h"]
    idx = r["y_test"].index.values
    preco_t = preco_full[idx]
    preco_real_h = df[f"y_next_t{h}"].values[idx]
    pred = r["pred"]
    y_real = r["y_test"].values

    acertos = (pred == y_real)

    fig, axes = plt.subplots(3, 1, figsize=(15, 9), sharex=True)

    # painel 1: preço real t+h colorido por acerto/erro
    axes[0].plot(preco_real_h, color="black", alpha=0.5, linewidth=1, label=f"Real t+{h}")
    axes[0].scatter(
        np.arange(len(preco_real_h))[acertos],
        preco_real_h[acertos],
        color="green", s=6, alpha=0.6, label="Acerto"
    )
    axes[0].scatter(
        np.arange(len(preco_real_h))[~acertos],
        preco_real_h[~acertos],
        color="red", s=6, alpha=0.6, label="Erro"
    )
    axes[0].set_title(f"t+{h} | acc = {r['acc']:.4f} (baseline {r['acc_baseline']:.4f})")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # painel 2: direção real vs prevista
    axes[1].plot(y_real, label="Real", alpha=0.7, linewidth=1)
    axes[1].plot(pred, label="Previsto", alpha=0.7, linewidth=1, linestyle="--")
    axes[1].set_yticks([0, 1])
    axes[1].set_yticklabels(["Baixa", "Alta"])
    axes[1].set_title("Direção real vs prevista")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    # painel 3: erros acumulados (simples)
    erro_dir = (y_real != pred).astype(int)
    erro_acum = np.cumsum(erro_dir)
    axes[2].plot(erro_acum, color="purple", alpha=0.7, linewidth=1)
    axes[2].set_title("Erros de direção acumulados")
    axes[2].grid(alpha=0.3)

    plt.tight_layout()
    plt.show()

# ============================================================
# 10. VISUALIZAÇÃO — PREÇO REAL vs PREÇO PREVISTO
# ============================================================
for r in resultados_plot:
    h = r["h"]
    idx = r["y_test"].index.values
    pred = r["pred"]
    y_real = r["y_test"].values

    preco_real_h = df[f"y_next_t{h}"].values[idx]
    preco_t = df[target_col].values[idx]

    # médias de movimento calculadas APENAS no treino (sem vazamento)
    idx_train = X_train.index.values
    preco_t_train = df[target_col].values[idx_train]
    preco_h_train = df[f"y_next_t{h}"].values[idx_train]
    y_dir_train = df[f"y_dir_t{h}"].values[idx_train]

    mov_alta = (preco_h_train - preco_t_train)[y_dir_train == 1].mean() if (y_dir_train == 1).any() else 0.0
    mov_baixa = (preco_h_train - preco_t_train)[y_dir_train == 0].mean() if (y_dir_train == 0).any() else 0.0

    print(f"t+{h} | mov_alta (treino) = {mov_alta:.4f} | mov_baixa (treino) = {mov_baixa:.4f}")

    preco_previsto = np.where(
        pred == 1,
        preco_t + mov_alta,
        preco_t + mov_baixa,
    )

    rsi_signal_test = df["rsi_signal"].values[idx] if "rsi_signal" in df.columns else None

    fig, axes = plt.subplots(2, 1, figsize=(15, 8), sharex=True)

    axes[0].plot(preco_real_h, label=f"Real t+{h}", alpha=0.8, linewidth=1.2)
    axes[0].plot(preco_previsto, label=f"Previsto t+{h}", alpha=0.8, linestyle="--", linewidth=1.2)
    axes[0].plot(preco_t, label="Atual t", alpha=0.5, linestyle=":", linewidth=1)
    axes[0].set_title(f"t+{h} | acc = {r['acc']:.4f} (baseline {r['acc_baseline']:.4f})")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    axes[1].plot(pred, label="Previsão do modelo", alpha=0.7, linewidth=1)
    if rsi_signal_test is not None:
        axes[1].plot(rsi_signal_test, label="rsi_signal", alpha=0.7, linewidth=1, linestyle="--")
    axes[1].set_yticks([0, 1])
    axes[1].set_yticklabels(["Baixa", "Alta"])
    axes[1].set_title("Modelo vs rsi_signal (se coincidirem, o modelo só copia)")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.show()