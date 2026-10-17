import xgboost as xgb
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
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
data_service.add_rsi_primary(mode="simulation", symbols="ETHUSDT", period=2, media_period=20)
data_service.add_price(mode="simulation", symbol="ETHUSDT", time="15m")
data_service.add_Schrodinger(modo="simulation", symbols="ETHUSDT", time="15m", accumulation_period="month")

def normalize_data():
    data = data_service.indicators_dataframe()
    return data

# pega os dados normalizados
df = normalize_data()


print("Primeiras linhas do DataFrame:")
print(df.head())
print("\nColunas disponíveis:", df.columns.tolist())

# ============================================================
# 2. PREPARAÇÃO DAS FEATURES
# ============================================================
target_col = "trendPrice_TREND"

feature_cols = [
    c for c in df.columns
    if c not in [
        target_col, "close", "close_VPPR", "Volume","Abertura","Maximo", "Minimo","Fechamento","open",
        "symbol", "time", "volume",
        "vppr_macd","macd","macd_signal",
        "macd_histogram",
        "ema_fast", "ema_slow", 'vppr_ema',
        "rsi_ma",'limite_TREND', 'wave_function','vppr','schrodinger_H', 'schrodinger_potencial',
        'trendPrice_TREND', 'type_TREND','rsi','trendPrice_TREND_PRIMARY',
        'ema_TREND', 'ema_fast_TREND', 'ema_slow_TREND', 'macd_TREND', 'macd_signal_TREND', 'macd_histogram_TREND'
    ]
]


# limpa nomes de colunas (remove espaços acidentais, ex.: " macd_signal")
df.columns = df.columns.str.strip()
feature_cols = [c.strip() for c in feature_cols]

df = df.reset_index(drop=True)
print(df[["time", "Fechamento", "close_VPPR", "trendPrice_TREND_PRIMARY", "type_TREND_PRIMARY"]].head(20))
# ============================================================
# 3. CRIAÇÃO DOS ALVOS t+1 ... t+5
# ============================================================
horizontes = [1,2,3 ] 

for h in horizontes:
    df[f"y_next_t{h}"] = df[target_col].shift(-h)
    # força binário: 1 se subiu, 0 se caiu (ignora "ficou igual")
    df[f"y_dir_t{h}"] = np.where(
        df[f"y_next_t{h}"] > df[target_col], 1, 0
    )

# remove NaN (últimas 5 linhas terão NaN em algum horizonte)
df = df.dropna(subset=[target_col]).reset_index(drop=True)

print("\nTotal de linhas após limpeza:", len(df))

# ============================================================
# 4. SPLIT TEMPORAL
# ============================================================
split = int(len(df) * 0.8)

X = df[feature_cols]
X_train, X_test = X.iloc[:split], X.iloc[split:]

print(f"\nTreino: {len(X_train)} | Teste: {len(X_test)}")
print(f"Features usadas ({len(feature_cols)}): {feature_cols}")


# ============================================================
# 5. FUNÇÕES AUXILIARES
# ============================================================
def make_classifier(n_classes):
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
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=42,
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
        )


def avaliar_horizonte(h):
    """
    Treina um classificador de direção para o horizonte t+h
    e retorna métricas + modelo + previsões.
    """
    col_dir = f"y_dir_t{h}"
    y_dir = df[col_dir]

    # split primeiro
    y_train_raw = y_dir.iloc[:split]
    y_test_raw = y_dir.iloc[split:]

    # --------------------------------------------------------
    # classes presentes APENAS no treino
    # --------------------------------------------------------
    classes_treino = sorted(y_train_raw.unique())

    if len(classes_treino) < 2:
        print(f"\n⚠️  t+{h}: apenas 1 classe no treino — pulando.")
        return None

    # mapa baseado só no treino
    mapa = {c: i for i, c in enumerate(classes_treino)}
    n_classes = len(mapa)

    # aplica o mapa; no teste, classes desconhecidas viram -1 (vamos filtrar)
    y_train = y_train_raw.map(mapa)
    y_test = y_test_raw.map(mapa)

    # --------------------------------------------------------
    # remove amostras do teste cuja classe não existe no treino
    # --------------------------------------------------------
    mask_valid = y_test.notna()
    y_test = y_test[mask_valid].astype(int)
    X_test_h = X_test[mask_valid.values]  # alinha X_test com y_test

    if len(y_test) == 0:
        print(f"\n⚠️  t+{h}: nenhuma amostra válida no teste — pulando.")
        return None

    # distribuição (do dataset inteiro, só pra log)
    dist = y_dir.value_counts(normalize=True).sort_index()

    model = make_classifier(n_classes)
    model.fit(X_train, y_train)
    pred = model.predict(X_test_h)

    # baseline: classe majoritária do treino
    classe_maj = y_train.mode()[0]
    baseline = np.full(len(y_test), classe_maj)

    acc = accuracy_score(y_test, pred)
    f1m = f1_score(y_test, pred, average="macro")
    acc_b = accuracy_score(y_test, baseline)
    f1m_b = f1_score(y_test, baseline, average="macro")

    cm = confusion_matrix(y_test, pred)
    report = classification_report(y_test, pred, digits=4, output_dict=True)

    resultado = {
        "h": h,
        "n_classes": n_classes,
        "mapa": mapa,
        "dist": dist.to_dict(),
        "acc": acc,
        "f1_macro": f1m,
        "acc_baseline": acc_b,
        "f1_baseline": f1m_b,
        "gap_acc": acc - acc_b,
        "gap_f1": f1m - f1m_b,
        "matriz_confusao": cm,
        "report": report,
        "model": model,
        "pred": pred,
        "y_test": y_test,
        "bateu_baseline": (acc > acc_b) and (f1m > f1m_b),
    }

    print(f"\n{'='*60}")
    print(f"HORIZONTE t+{h}")
    print(f"{'='*60}")
    print(f"Distribuição (dataset): {dist.to_dict()}")
    print(f"Classes no treino: {classes_treino} | mapa: {mapa}")
    print(f"Amostras teste válidas: {len(y_test)} / {len(y_test_raw)}")
    print(f"Acurácia:  modelo = {acc:.4f}  |  baseline = {acc_b:.4f}  |  gap = {acc - acc_b:+.4f}")
    print(f"F1 macro:  modelo = {f1m:.4f}  |  baseline = {f1m_b:.4f}  |  gap = {f1m - f1m_b:+.4f}")
    print(f"Bateu baseline? {'✅ SIM' if resultado['bateu_baseline'] else '❌ NÃO'}")
    print("\nMatriz de confusão:")
    print(cm)
    print("\nClassification report:")
    print(classification_report(y_test, pred, digits=4))

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
print("\n\n" + "="*80)
print("RESUMO — DIREÇÃO POR HORIZONTE")
print("="*80)

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
# 9. VISUALIZAÇÃO — ALVO vs PREVISÃO (corrigido)
# ============================================================
horizontes_para_plotar = [1, 2, 3]
resultados_plot = [r for r in resultados if r["h"] in horizontes_para_plotar]

preco_full = df[target_col].values

for r in resultados_plot:
    h = r["h"]
    idx = r["y_test"].index.values
    preco_t = preco_full[idx]
    preco_real_h = df[f"y_next_t{h}"].values[idx]      # alvo real t+h (contínuo)
    pred = r["pred"]                                    # previsão de direção (0/1)
    y_real = r["y_test"].values                         # direção real (0/1)

    # Reconstrói a previsão contínua a partir da direção
    retorno_real = (preco_real_h - preco_t) / preco_t
    mask_alta = (y_real == 1)
    mask_baixa = (y_real == 0)
    ret_alta = retorno_real[mask_alta].mean() if mask_alta.any() else 0.0
    ret_baixa = retorno_real[mask_baixa].mean() if mask_baixa.any() else 0.0
    ret_previsto = np.where(pred == 1, ret_alta, ret_baixa)
    preco_previsto = preco_t * (1 + ret_previsto)

    # Corrige NaN ou valores inválidos
    preco_previsto = pd.Series(preco_previsto).fillna(method="ffill").fillna(method="bfill").values

    # Plot alvo vs previsão
    plt.figure(figsize=(12,6))
    plt.plot(preco_real_h, label=f"Alvo real t+{h}", color="blue", linewidth=2)
    plt.plot(preco_previsto, label="Previsão", color="orange", linestyle="--", linewidth=2)
    plt.scatter(range(len(preco_previsto)), preco_previsto, color="orange", s=10, alpha=0.6)  # pontos previstos
    plt.title(f"Comparação Alvo vs Previsão — Horizonte t+{h}")
    plt.xlabel("Amostras (tempo)")
    plt.ylabel("Preço")
    plt.legend()
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.show()
