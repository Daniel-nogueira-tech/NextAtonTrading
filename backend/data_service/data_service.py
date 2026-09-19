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
        # supondo que result seja lista de dicts
        self.dados["RSI"] = result
        return result

    def add_vppr(self, symbols=None, time=None, modo="", accumulation_period=None):
        result = get_vppr(
            symbols=symbols,
            time=time,
            modo=modo,
            accumulation_period=accumulation_period,
        )
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
        return result   

    def indicators(self):
        return self.dados

    def indicators_dataframe(self):
        rows = {}
        # dicionário de mapeamento dos tipos
        def add_row(symbol, timestamp, values):
            key = (symbol, timestamp)
            row = rows.setdefault(key, {"symbol": symbol, "time": timestamp})
            row.update(values)

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

            result = value.get("result")
            if result is not None:
                collect(result, feature_name, current_symbol)
                return

            timestamp = (
                value.get("time")
                or value.get("tempo")
                or value.get("Tempo")
                or value.get("closeTime")
            )
            if timestamp is None:
                return

            features = {
                key: item
                for key, item in value.items()
                if key not in {"time", "tempo", "Tempo", "closeTime", "symbol", "index", "tipo"}
                and isinstance(item, (int, float, bool))
            }
            type_val = value.get("tipo")

            if type_val:
                # se tiver parêntese, pega só a parte antes dele
                if "(" in type_val:
                    type_base = type_val.split("(")[0].strip()
                else:
                    type_base = type_val.strip()

                # mapeamento simplificado
                type_map = {
                    "Tendência Alta": 1,
                    "Tendência Baixa": 0,
                    "Reação Natural": 2,
                    "Rally Natural": 3,
                    "Reação secundária": 2,
                    "Rally secundário": 3,
                }

                if type_base in type_map:
                    features[f"type_{feature_name}"] = type_map[type_base]



            if features and current_symbol is not None:
                add_row(current_symbol, timestamp, features)

        for feature_name, value in self.dados.items():
            collect(value, feature_name)

        df = pd.DataFrame(rows.values())

        # remove linhas com valores nulos
        df = df.dropna()

        return df


data_service = DataService()

