import unicodedata

import pandas as pd
from controllers.rsi_controller import get_rsi
from controllers.vppr_controller import get_vppr
from controllers.trend_clarifications_controllers import trend_clarifications_atr
from controllers.trend_primary_clarifications_controllers import trend_primary_clarifications_atr
from controllers.price_data_controller import get_price_data


#==============|Pega os indicadores para centralizar|===============#
class DataService:
    def __init__(self):
        self.dados = {}

    def add_rsi(self, symbols=None, symbol=None, period=15, media_period=15, mode=""):
        result = get_rsi(
            symbols=symbols,
            symbol=symbol,
            period=period,
            media_period=media_period,
            mode=mode
        )
        # adiciona classificação baseada no valor do RSI
        for block in result:
        # cada bloco tem uma lista em "result"
          if "result" in block and isinstance(block["result"], list):
            for row in block["result"]:
                rsi_val = row.get("rsi")
                if rsi_val is not None:
                    if rsi_val >= 70:
                        row["rsi_signal"] = 0   # sobrecompra
                    elif rsi_val <= 30:
                        row["rsi_signal"] = 1   # sobrevenda
                    else:
                        row["rsi_signal"] = None  # zona neutra

        self.dados["RSI"] = result[-1]
        return result

    def add_vppr(self, symbols=None, time=None, modo="", accumulation_period=None):
        result = get_vppr(
            symbols=symbols,
            time=time,
            modo=modo,
            accumulation_period=accumulation_period,
        )
        for block in result:
            if result:
                for row in block["result"]:
                   vppr_val = row.get("vppr")
                   vppr_ema_val = row.get("vppr_ema")
                   if vppr_val and vppr_ema_val is not None:
                        if vppr_val > (vppr_ema_val + (vppr_ema_val * 0.02)):
                            row["vppr_signal"] = 1 # Acima da Média
                        elif vppr_val < (vppr_ema_val - (vppr_ema_val * 0.02)):
                            row["vppr_signal"] = 0 #Abaixo da média
                        else:
                            row["vppr_signal"] = None #zona neutra
                           
        self.dados["VPPR"] = result

        return result

    def add_trend(self, symbols=None, time=None, mode=""):
        result = trend_clarifications_atr(symbols=symbols, time=time, mode=mode)
        self.dados["TREND"] = result
        return result

    def add_trend_primary(self, symbols=None, time=None, mode=""):
        result = trend_primary_clarifications_atr(symbols=symbols, time=time, mode=mode)
        self.dados["TREND_PRIMARY"] = result
        return result    

    def add_price(self, mode="", symbol=None, time=None):
        result = get_price_data(mode=mode, symbol=symbol, time=time)
        self.dados[f"PRICE_{symbol}"] = result

        for row in result[:3]:
        # mostra apenas algumas chaves
          print({ 
            "Tempo": row.get("Tempo"),
            "Abertura": row.get("Abertura"),
            "Fechamento": row.get("Fechamento"),
            "Volume": row.get("Volume")
          })
    
        return result   

    def indicators(self):
        return self.dados

    def indicators_dataframe(self):
        rows = {}
        price_columns = {
            "close": "Fechamento",
            "closePrice": "Fechamento",
            "open": "Abertura",
            "high": "Maximo",
            "low": "Minimo",
            "volume": "Volume",
        }

        # dicionário de mapeamento dos tipos
        def add_row(symbol, timestamp, values, is_price=False):
            key = (symbol, timestamp)
            row = rows.setdefault(key, {"symbol": symbol, "time": timestamp})
            for column_name, item in values.items():
                # O fechamento oficial vem sempre do candle de preço. Um
                # indicador nunca pode substituir essa coluna ao mesclar.
                if column_name == "Fechamento" and not is_price:
                    continue
                if column_name == "Fechamento" and "Fechamento" in row and not is_price:
                    continue
                row[column_name] = item

        def collect(value, feature_name, symbol=None):
            if isinstance(value, list):
                for item in value:
                    collect(item, feature_name, symbol)
                return

            if not isinstance(value, dict):
                return

            current_symbol = value.get("symbol", symbol)
            movements = value.get("movements")
            if movements is not None:
                collect(movements, feature_name, current_symbol)
                return

            for nested_key in ("result", "prices"):
                nested_value = value.get(nested_key)
                if nested_value is not None:
                    collect(nested_value, feature_name, current_symbol)
                    return

            timestamp = (
                value.get("time")
                or value.get("tempo")
                or value.get("Tempo")
                or value.get("closeTime")
            )
            if timestamp is None:
                return

            features = {}
            for key, item in value.items():
                if key in {"time", "tempo", "Tempo", "closeTime", "symbol", "index", "tipo"}:
                    continue
                if not isinstance(item, (int, float, bool)):
                    continue

                # Trend and trend-primary expose the same field names. Keep
                # both values instead of letting the later indicator replace
                # the earlier one in the merged candle.
                column_name = key
                is_price = feature_name.startswith("PRICE_")
                if is_price:
                    column_name = price_columns.get(key, key)
                elif feature_name == "VPPR" and key == "close":
                    column_name = "close_VPPR"
                if feature_name in {"TREND", "TREND_PRIMARY"}:
                    if key == "closePrice":
                        column_name = f"trendPrice_{feature_name}"
                    else:
                        column_name = f"{key}_{feature_name}"
                features[column_name] = item
            type_val = value.get("tipo")

            if type_val:
                # se tiver parêntese, pega só a parte antes dele
                if "(" in type_val:
                    type_base = type_val.split("(")[0].strip()
                else:
                    type_base = type_val.strip()
                type_base = unicodedata.normalize("NFC", type_base).casefold()

                # mapeamento simplificado
                type_map = {
                    "tendência alta": 1,
                    "tendência baixa": 0,
                    "reação natural": 2,
                    "rally natural": 3,
                    "reação secundária": 2,
                    "rally secundário": 3,
                }

                if type_base in type_map:
                    features[f"type_{feature_name}"] = type_map[type_base]



            if features and current_symbol is not None:
                add_row(
                    current_symbol,
                    timestamp,
                    features,
                    is_price=feature_name.startswith("PRICE_"),
                )

        for feature_name, value in self.dados.items():
            collect(value, feature_name)

        df = pd.DataFrame(rows.values())

        # Mantém todos os candles de preço; indicadores de evento, como as
        # tendências, só existem nos timestamps em que um movimento ocorreu.
        if "Fechamento" in df.columns:
            df = df.dropna(subset=["Fechamento"])

        return df


data_service = DataService()

