import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, accuracy_score, f1_score, confusion_matrix
from sklearn.dummy import DummyClassifier
import seaborn as sns
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd



from data_service.data_service import data_service


data_service.add_trend_primary(
    symbols="BTCUSDT",
    time="15m",
    mode="simulation",
)
data_service.add_trend(
    symbols="BTCUSDT",
    time="15m",
    mode="simulation",
)

data_service.add_vppr(
    modo="simulation", 
    symbols="BTCUSDT", 
    time="15m",
    accumulation_period="month",
)
data_service.add_rsi(
    mode="simulation", 
    symbols="BTCUSDT", 
    period=10,
    media_period=10,
)



def normalize_data():
    data = data_service.indicators_dataframe()
    print('data', data)
    return data



# pega os dados normalizados
df = normalize_data()

print("Primeiras linhas do DataFrame:")
print(df.head())

print("\nColunas disponíveis:", df.columns.tolist())

# Defina o alvo

target_col = "type_TREND"

# cria 5 colunas alvo deslocadas (próximos candles)
for i in range(1, 6):
    df[f"{target_col}_t+{i}"] = df[target_col].shift(-i)

# remove linhas com NaN (últimas 5)
df = df.dropna()

# features (sem o alvo atual e sem symbol/time)
X = df.drop(columns=[target_col, "symbol", "time"] + [f"{target_col}_t+{i}" for i in range(1, 6)], errors="ignore")

# vamos prever o próximo candle (t+1) primeiro
y = df[f"{target_col}_t+1"]

# split temporal
split = int(len(X) * 0.8)
X_train, X_test = X.iloc[:split], X.iloc[split:]
y_train, y_test = y.iloc[:split], y.iloc[split:]

# modelo
model = xgb.XGBClassifier(
    n_estimators=2500,
    max_depth=3, #3
    learning_rate=0.009,
    eval_metric="mlogloss",
    use_label_encoder=False,
    subsample=0.5, #0.5
    colsample_bytree=0.6, #0.6
    gamma=0, #0
    reg_alpha=0.1,
    reg_lambda=1,
    class_weight=5, 
    max_delta_step=5,
)
model.fit(X_train, y_train)

# previsões para t+1
y_pred = model.predict(X_test)

print("Acurácia (t+1):", accuracy_score(y_test, y_pred))
print("F1-score (t+1):", f1_score(y_test, y_pred, average="weighted"))

# matriz de confusão
cm = pd.crosstab(y_test, y_pred, rownames=["Real"], colnames=["Previsto"])
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues")
plt.show()

# ⚠️ Para prever t+2 até t+5, basta repetir o processo trocando o alvo:
for i in range(2, 6):
    y_future = df[f"{target_col}_t+{i}"]

    # split temporal
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y_future.iloc[:split], y_future.iloc[split:]

    # treina modelo
    model.fit(X_train, y_train)

    # previsões
    y_pred = model.predict(X_test)

    # importância das features
    importance = model.get_booster().get_score(importance_type="gain")
    feat_imp = pd.Series(importance).sort_values(ascending=False)

    print("\nTop indicadores mais usados:")
    print(feat_imp.head(20))
    print(f"Acurácia (t+{i}):", accuracy_score(y_test, y_pred))
    print(f"F1-score (t+{i}):", f1_score(y_test, y_pred, average="weighted"))
    


'''
# matriz de confusão
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues")
plt.xlabel("Previsto")
plt.ylabel("Real")
plt.show()

'''