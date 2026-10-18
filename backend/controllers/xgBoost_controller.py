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
data_service.add_rsi_primary(mode="simulation", symbols="ETHUSDT", period=5, media_period=20)
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
        "ema_fast", "ema_slow", 'vppr_ema','limite_TREND_PRIMARY','schrodinger_buy', 'schrodinger_sell','type_TREND_PRIMARY',
        "rsi_ma",'limite_TREND','vppr','schrodinger_H', 'schrodinger_potencial',
        'trendPrice_TREND', 'type_TREND','rsi','trendPrice_TREND_PRIMARY',
        'ema_TREND', 'ema_fast_TREND', 'ema_slow_TREND', 'macd_TREND', 'macd_signal_TREND', 'macd_histogram_TREND'
    ]
]

# 1) Com que frequência a tendência MUDA de valor?
s = df[target_col].copy().reset_index(drop=True)
mudou = (s.diff() != 0).sum()
print(f"trendPrice_TREND mudou de valor em {mudou} de {len(s)} candles ({100*mudou/len(s):.1f}%)")
print(f"  → Ficou PARADO em {100 - 100*mudou/len(s):.1f}% dos candles")
print()

# 2) Distribuição do alvo t+1
y_dir_t1 = (s.shift(-1) > s).astype(int)
print("Distribuição de y_dir_t1:")
print(y_dir_t1.value_counts(normalize=True))
print()

# 3) Quando y_dir_t1 = 1, o que significa?
mudou_para_cima = ((s.shift(-1) > s) & (s.shift(-1) != s)).sum()
print(f"y_dir_t1=1 significa ROMpimento para cima: {mudou_para_cima} vezes ({100*mudou_para_cima/len(s):.1f}%)")
print(f"y_dir_t1=0 significa: ficou parado OU caiu = {len(s) - mudou_para_cima} vezes")
print()

# 4) Confirmação: rsi_signal + movimento do preço ANTECEDE o rompimento?
retorno_atual = df["Fechamento"].pct_change()
mask_sobrecompra = df["rsi_signal"] == 0
mask_sobrevenda = df["rsi_signal"] == 1

print("Probabilidade de y_dir_t1=1 DADO o rsi_signal:")
for sig in [0, 1, 2]:
    mask = df["rsi_signal"] == sig
    if mask.sum() > 0:
        prob = y_dir_t1[mask].mean()
        print(f"  rsi_signal={sig}: P(y=1) = {prob:.4f}  (n={mask.sum()})")

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

from sklearn.metrics import roc_curve, auc, precision_recall_curve
from matplotlib.patches import Patch
import seaborn as sns

# ============================================================
# 8. VISUALIZAÇÃO AVANÇADA — DIAGNÓSTICO DO MODELO
# ============================================================

# ---------- 8.1 Matrizes de confusão lado a lado ----------
n = len(resultados)
fig, axes = plt.subplots(1, n, figsize=(5*n, 4.5))
if n == 1: axes = [axes]

for ax, r in zip(axes, resultados):
    cm = r["matriz_confusao"]
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax,
                xticklabels=["Prev 0", "Prev 1"][:cm.shape[1]],
                yticklabels=["Real 0", "Real 1"][:cm.shape[0]])
    ax.set_title(f"t+{r['h']}  |  Acc={r['acc']:.3f} (base {r['acc_baseline']:.3f})")
    ax.set_xlabel("Previsto"); ax.set_ylabel("Real")

plt.suptitle("Matrizes de confusão por horizonte", fontsize=14, y=1.02)
plt.tight_layout(); plt.show()


# ---------- 8.2 Curvas ROC e Precision-Recall ----------
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

for r in resultados:
    if r["n_classes"] != 2:
        continue
    model = r["model"]
    y_test = r["y_test"].values
    # pega probabilidade da classe positiva
    proba = model.predict_proba(X_test.loc[r["y_test"].index])[:, 1]

    fpr, tpr, _ = roc_curve(y_test, proba)
    roc_auc = auc(fpr, tpr)
    axes[0].plot(fpr, tpr, linewidth=2, label=f"t+{r['h']} (AUC={roc_auc:.3f})")

    prec, rec, _ = precision_recall_curve(y_test, proba)
    axes[1].plot(rec, prec, linewidth=2, label=f"t+{r['h']}")

axes[0].plot([0,1],[0,1],'k--',alpha=0.5,label="Aleatório")
axes[0].set_xlabel("FPR"); axes[0].set_ylabel("TPR")
axes[0].set_title("Curva ROC"); axes[0].legend(); axes[0].grid(alpha=0.3)

axes[1].set_xlabel("Recall"); axes[1].set_ylabel("Precision")
axes[1].set_title("Curva Precision-Recall"); axes[1].legend(); axes[1].grid(alpha=0.3)

plt.tight_layout(); plt.show()


# ---------- 8.3 Importância das features ----------
fig, axes = plt.subplots(1, n, figsize=(6*n, 5))
if n == 1: axes = [axes]
for ax, r in zip(axes, resultados):
    imp = pd.Series(r["model"].feature_importances_, index=feature_cols).sort_values()
    imp.tail(15).plot.barh(ax=ax, color="teal")
    ax.set_title(f"Top features — t+{r['h']}")
    ax.grid(alpha=0.3, axis="x")
plt.tight_layout(); plt.show()


# ---------- 8.4 Distribuição de retornos por classe prevista ----------
fig, axes = plt.subplots(1, n, figsize=(6*n, 4))
if n == 1: axes = [axes]
for ax, r in zip(axes, resultados):
    h = r["h"]
    idx = r["y_test"].index.values
    preco_t   = df[target_col].values[idx]
    preco_th  = df[f"y_next_t{h}"].values[idx]
    ret_real  = (preco_th - preco_t) / preco_t * 100
    pred      = r["pred"]

    ax.hist(ret_real[pred==1], bins=40, alpha=0.6, label="Previsto ALTA", color="green")
    ax.hist(ret_real[pred==0], bins=40, alpha=0.6, label="Previsto BAIXA", color="red")
    ax.axvline(0, color="black", linestyle="--")
    ax.set_title(f"Retorno real t+{h} condicionado à previsão")
    ax.set_xlabel("Retorno (%)"); ax.set_ylabel("Frequência")
    ax.legend(); ax.grid(alpha=0.3)
plt.tight_layout(); plt.show()


# ============================================================
# 9. GRÁFICO HONESTO: PREÇO + SINAIS DO MODELO
# ============================================================
# Aqui mostramos o preço REAL contínuo e marcamos no tempo
# os pontos onde o modelo previu ALTA (verde) e BAIXA (vermelho),
# evidenciando acertos e erros.

fig, axes = plt.subplots(len(resultados), 1,
                         figsize=(15, 4.5*len(resultados)), sharex=False)
if len(resultados) == 1: axes = [axes]

for ax, r in zip(axes, resultados):
    h   = r["h"]
    idx = r["y_test"].index.values
    preco_t  = df[target_col].values[idx]
    preco_th = df[f"y_next_t{h}"].values[idx]
    y_real   = r["y_test"].values
    pred     = r["pred"]

    x = np.arange(len(idx))
    ax.plot(x, preco_t, color="black", linewidth=1.2, label="Preço atual", alpha=0.8)

    # pontos onde o modelo acertou / errou
    acerto_alta  = (pred==1) & (y_real==1)
    acerto_baixa = (pred==0) & (y_real==0)
    erro_alta    = (pred==1) & (y_real==0)   # previu alta, caiu
    erro_baixa   = (pred==0) & (y_real==1)   # previu baixa, subiu

    ax.scatter(x[acerto_alta],  preco_t[acerto_alta],  s=18, c="lime",   label=f"Acerto ALTA ({acerto_alta.sum()})",  zorder=3)
    ax.scatter(x[acerto_baixa], preco_t[acerto_baixa], s=18, c="green",  label=f"Acerto BAIXA ({acerto_baixa.sum()})", zorder=3)
    ax.scatter(x[erro_alta],    preco_t[erro_alta],    s=22, c="red",    marker="x", label=f"Erro (previu alta) ({erro_alta.sum()})",  zorder=4)
    ax.scatter(x[erro_baixa],   preco_t[erro_baixa],   s=22, c="orange", marker="x", label=f"Erro (previu baixa) ({erro_baixa.sum()})", zorder=4)

    ax.set_title(f"t+{h}  |  Acertos: {acerto_alta.sum()+acerto_baixa.sum()}/{len(pred)}  ({100*r['acc']:.1f}%)")
    ax.set_ylabel("Preço")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", fontsize=8, ncol=2)

plt.xlabel("Amostras (tempo)")
plt.tight_layout(); plt.show()


# ============================================================
# 10. EVOLUÇÃO TEMPORAL DA ACURÁCIA (janela deslizante)
# ============================================================
# Mostra se o modelo degrada com o tempo (drift).

fig, axes = plt.subplots(len(resultados), 1,
                         figsize=(14, 3.5*len(resultados)))
if len(resultados) == 1: axes = [axes]

window = max(30, len(resultados[0]["pred"]) // 20)  # janela adaptativa
for ax, r in zip(axes, resultados):
    corretos = (r["pred"] == r["y_test"].values).astype(int)
    serie = pd.Series(corretos)
    acc_rol = serie.rolling(window).mean()
    ax.plot(acc_rol, color="navy", linewidth=1.8)
    ax.axhline(r["acc"], color="red", linestyle="--", label=f"Acc global = {r['acc']:.3f}")
    ax.axhline(r["acc_baseline"], color="gray", linestyle=":", label=f"Baseline = {r['acc_baseline']:.3f}")
    ax.set_title(f"Acurácia em janela deslizante (t+{r['h']}, janela={window})")
    ax.set_ylabel("Acurácia"); ax.grid(alpha=0.3); ax.legend()
plt.xlabel("Amostras do teste")
plt.tight_layout(); plt.show()

#------------------
idx = resultados[0]["y_test"].index.values
preco_t  = df[target_col].values[idx]
preco_th = df["y_next_t1"].values[idx]

print("preco_t  -> NaN:", np.isnan(preco_t).sum(), "| zeros:", (preco_t==0).sum(), "| min:", np.nanmin(preco_t), "| max:", np.nanmax(preco_t))
print("preco_th -> NaN:", np.isnan(preco_th).sum(), "| zeros:", (preco_th==0).sum(), "| min:", np.nanmin(preco_th), "| max:", np.nanmax(preco_th))

ret_real = (preco_th - preco_t) / preco_t
print("\nret_real -> NaN:", np.isnan(ret_real).sum(), "| inf:", np.isinf(ret_real).sum())
print("ret_real stats:", pd.Series(ret_real).describe())

# limpeza defensiva antes do backtest
col_preco = target_col
df[col_preco] = df[col_preco].replace([np.inf, -np.inf], np.nan)
df = df[(df[col_preco] > 0)].reset_index(drop=True)

# re-split para garantir alinhamento
split = int(len(df) * 0.8)
X = df[feature_cols]
X_train, X_test = X.iloc[:split], X.iloc[split:]# limpeza defensiva antes do backtest
col_preco = target_col
df[col_preco] = df[col_preco].replace([np.inf, -np.inf], np.nan)
df = df[(df[col_preco] > 0)].reset_index(drop=True)

# re-split para garantir alinhamento
split = int(len(df) * 0.8)
X = df[feature_cols]
X_train, X_test = X.iloc[:split], X.iloc[split:]
#------------------
# ============================================================
# 11. BACKTEST SIMPLES — CLASSIFICADOR DE DIREÇÃO
# ============================================================
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# ---------- configuração ----------
CUSTO_BPS = 5          # custo por trade em basis points (5 bps = 0.05%)
CAPITAL_INICIAL = 1000 # banca inicial (unidades arbitrárias)
THRESHOLD = 0.55       # confiança mínima para entrar (só para 2 classes)


def backtest_horizonte(r, custo_bps=CUSTO_BPS, capital_inicial=CAPITAL_INICIAL,
                        threshold=THRESHOLD):
    """
    Simula operações usando a previsão de direção do modelo.
    - Entra LONG se previu alta (1) e prob > threshold
    - Entra SHORT se previu baixa (0) e prob < (1 - threshold)
    - Caso contrário, fica fora (cash)
    Retorna um DataFrame com retornos por operação e a curva de capital.
    """
    h = r["h"]
    idx = r["y_test"].index.values
    y_real = r["y_test"].values
    pred = r["pred"]

    # preços
    preco_t  = df[target_col].values[idx]        # preço no instante da decisão
    preco_th = df[f"y_next_t{h}"].values[idx]    # preço em t+h (realizado)

    # retorno realizado t -> t+h
    ret_real = (preco_th - preco_t) / preco_t

    # probabilidade (se disponível)
    if hasattr(r["model"], "predict_proba") and r["n_classes"] == 2:
        proba = r["model"].predict_proba(X_test.loc[r["y_test"].index])[:, 1]
    else:
        proba = pred.astype(float)  # fallback: 0/1 puro

    # decisão
    posicao = np.zeros(len(pred))
    posicao[(pred == 1) & (proba > threshold)]  =  1.0    # LONG
    posicao[(pred == 0) & (proba < (1 - threshold))] = -1.0  # SHORT
    # restante = 0 (cash)

    # retorno da estratégia POR OPERAÇÃO (não somado ainda)
    # custo só quando muda de posição
    posicao_ant = np.concatenate([[0.0], posicao[:-1]])
    trocou = (posicao != posicao_ant).astype(float)
    custo = trocou * (custo_bps / 10000.0)

    ret_estrategia = posicao * ret_real - custo

    # curva de capital
    capital = capital_inicial * np.cumprod(1 + ret_estrategia)
    # buy & hold equivalente
    bh = capital_inicial * np.cumprod(1 + ret_real)

    # ---------- métricas de trading ----------
    trades = ret_estrategia[posicao != 0]   # só operações reais
    n_trades = len(trades)

    if n_trades > 0:
        win_rate = (trades > 0).mean()
        avg_win  = trades[trades > 0].mean() if (trades > 0).any() else 0.0
        avg_loss = trades[trades < 0].mean() if (trades < 0).any() else 0.0
        profit_factor = (trades[trades > 0].sum() /
                         abs(trades[trades < 0].sum())) if (trades < 0).any() else np.inf
    else:
        win_rate = avg_win = avg_loss = 0.0
        profit_factor = 0.0

    retorno_total = capital[-1] / capital_inicial - 1
    bh_total      = bh[-1] / bh[0] - 1

    # max drawdown
    pico = np.maximum.accumulate(capital)
    dd   = (capital - pico) / pico
    max_dd = dd.min()

    # sharpe (assumindo anualização grosseira pelo horizonte)
    if ret_estrategia.std() > 0:
        sharpe = ret_estrategia.mean() / ret_estrategia.std() * np.sqrt(252 * (96 / h))
    else:
        sharpe = 0.0

    return {
        "h": h,
        "n_trades": n_trades,
        "win_rate": win_rate,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "profit_factor": profit_factor,
        "retorno_total": retorno_total,
        "bh_total": bh_total,
        "max_drawdown": max_dd,
        "sharpe": sharpe,
        "capital": capital,
        "bh": bh,
        "posicao": posicao,
        "ret_real": ret_real,
        "ret_estrategia": ret_estrategia,
        "proba": proba,
    }


# ============================================================
# 12. RODA O BACKTEST PARA CADA HORIZONTE
# ============================================================
backtests = [backtest_horizonte(r) for r in resultados]

print("\n" + "="*90)
print(f"BACKTEST — custo = {CUSTO_BPS} bps | threshold = {THRESHOLD}")
print("="*90)

tabela_bt = []
for bt in backtests:
    tabela_bt.append({
        "Horizonte":     f"t+{bt['h']}",
        "Trades":        bt["n_trades"],
        "Win rate":      f"{bt['win_rate']*100:.1f}%",
        "Profit factor": f"{bt['profit_factor']:.2f}",
        "Retorno":       f"{bt['retorno_total']*100:+.2f}%",
        "B&H":           f"{bt['bh_total']*100:+.2f}%",
        "Max DD":        f"{bt['max_drawdown']*100:.2f}%",
        "Sharpe":        f"{bt['sharpe']:.2f}",
    })

print(pd.DataFrame(tabela_bt).to_string(index=False))


# ============================================================
# 13. GRÁFICO — CURVA DE CAPITAL vs BUY & HOLD
# ============================================================
fig, axes = plt.subplots(len(backtests), 1,
                         figsize=(14, 3.8*len(backtests)), sharex=False)
if len(backtests) == 1: axes = [axes]

for ax, bt in zip(axes, backtests):
    ax.plot(bt["capital"], color="navy", linewidth=1.8,
            label=f"Estratégia ({bt['retorno_total']*100:+.1f}%)")
    ax.plot(bt["bh"], color="gray", linewidth=1.2, linestyle="--",
            label=f"Buy & Hold ({bt['bh_total']*100:+.1f}%)")
    ax.axhline(CAPITAL_INICIAL, color="black", linewidth=0.6, alpha=0.5)
    ax.set_title(f"Curva de capital — t+{bt['h']}  |  "
                 f"{bt['n_trades']} trades, win {bt['win_rate']*100:.1f}%, "
                 f"PF {bt['profit_factor']:.2f}, MaxDD {bt['max_drawdown']*100:.1f}%")
    ax.set_ylabel("Capital")
    ax.legend(loc="upper left")
    ax.grid(alpha=0.3)

plt.xlabel("Amostras do teste")
plt.tight_layout()
plt.show()


# ============================================================
# 14. THRESHOLD TUNING — escolhe o melhor corte de confiança
# ============================================================
thresholds = np.arange(0.50, 0.90, 0.02)

fig, axes = plt.subplots(1, len(resultados), figsize=(5*len(resultados), 4.5))
if len(resultados) == 1: axes = [axes]

for ax, r in zip(axes, resultados):
    h = r["h"]
    idx = r["y_test"].index.values
    preco_t  = df[target_col].values[idx]
    preco_th = df[f"y_next_t{h}"].values[idx]
    ret_real = (preco_th - preco_t) / preco_t

    proba = r["model"].predict_proba(X_test.loc[r["y_test"].index])[:, 1]
    pred  = r["pred"]

    retornos_por_th = []
    n_trades_por_th = []
    for t in thresholds:
        pos = np.zeros(len(pred))
        pos[(pred == 1) & (proba > t)]      =  1.0
        pos[(pred == 0) & (proba < (1-t))]  = -1.0

        pos_ant = np.concatenate([[0.0], pos[:-1]])
        custo   = (pos != pos_ant) * (CUSTO_BPS / 10000.0)
        ret     = pos * ret_real - custo

        ret_total = np.prod(1 + ret) - 1
        retornos_por_th.append(ret_total)
        n_trades_por_th.append((pos != 0).sum())

    ax.plot(thresholds, np.array(retornos_por_th) * 100,
            marker="o", color="purple", linewidth=2, label="Retorno total (%)")
    ax.axhline(0, color="black", linestyle="--", alpha=0.5)
    ax.set_title(f"t+{h} — retorno vs threshold")
    ax.set_xlabel("Threshold de confiança")
    ax.set_ylabel("Retorno total (%)")
    ax.grid(alpha=0.3)

    # anota o melhor threshold
    best_i = int(np.argmax(retornos_por_th))
    ax.scatter([thresholds[best_i]], [retornos_por_th[best_i]*100],
               s=120, facecolors="none", edgecolors="red", linewidth=2,
               label=f"Melhor: t={thresholds[best_i]:.2f} "
                     f"({retornos_por_th[best_i]*100:+.1f}%, {n_trades_por_th[best_i]} trades)")
    ax.legend(fontsize=8)

plt.suptitle("Threshold tuning — busca do melhor corte de confiança", y=1.02, fontsize=13)
plt.tight_layout()
plt.show()


# ============================================================
# 15. GRÁFICO — POSIÇÃO AO LONGO DO TEMPO
# ============================================================
fig, axes = plt.subplots(len(backtests), 1,
                         figsize=(14, 2.8*len(backtests)))
if len(backtests) == 1: axes = [axes]

for ax, bt in zip(axes, backtests):
    idx = np.arange(len(bt["posicao"]))
    ax.fill_between(idx, 0, bt["posicao"],
                    where=(bt["posicao"] > 0), color="green", alpha=0.5, label="LONG")
    ax.fill_between(idx, 0, bt["posicao"],
                    where=(bt["posicao"] < 0), color="red", alpha=0.5, label="SHORT")
    ax.axhline(0, color="black", linewidth=0.5)
    ax.set_ylim(-1.2, 1.2)
    ax.set_yticks([-1, 0, 1])
    ax.set_title(f"Posição — t+{bt['h']}  ({bt['n_trades']} trades)")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper right", fontsize=8)

plt.xlabel("Amostras do teste")
plt.tight_layout()
plt.show()


# ============================================================
# 16. DISTRIBUIÇÃO DOS RETORNOS POR TRADE
# ============================================================
fig, axes = plt.subplots(1, len(backtests), figsize=(5*len(backtests), 4))
if len(backtests) == 1: axes = [axes]

for ax, bt in zip(axes, backtests):
    trades = bt["ret_estrategia"][bt["posicao"] != 0]
    if len(trades) == 0:
        ax.text(0.5, 0.5, "Sem trades", ha="center", va="center",
                transform=ax.transAxes)
        continue
    ax.hist(trades * 100, bins=40, color="steelblue", alpha=0.8, edgecolor="black")
    ax.axvline(0, color="black", linestyle="--")
    ax.axvline(trades.mean()*100, color="red", linestyle=":",
               label=f"Média {trades.mean()*100:+.3f}%")
    ax.set_title(f"Retornos por trade — t+{bt['h']}  (n={len(trades)})")
    ax.set_xlabel("Retorno (%)"); ax.set_ylabel("Frequência")
    ax.legend(); ax.grid(alpha=0.3)

plt.suptitle("Distribuição dos retornos por trade", y=1.02, fontsize=13)
plt.tight_layout()
plt.show()