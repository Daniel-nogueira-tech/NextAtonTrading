import random
import datetime
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import gaussian_kde
from scipy.signal import find_peaks
from scipy.ndimage import gaussian_filter1d
from controllers.vppr_controller import get_vppr


def normalize_vppr_data(data):
    """Converte a resposta do VPPR em ordens agrupadas por ativo."""
    orders_by_symbol = {}

    def add_candle(symbol, candle):
        close = float(candle["close"])
        wave = float(candle.get("wave_function") or candle.get("vppr") or 0)

        order_type = str(candle.get("type", "")).lower()
        if order_type not in ("buy", "sell"):
            order_type = "buy" if wave >= 0 else "sell"

        raw_time = candle["time"]
        if isinstance(raw_time, datetime.datetime):
            order_time = raw_time
        else:
            order_time = datetime.datetime.fromisoformat(str(raw_time))

        orders_by_symbol.setdefault(symbol, []).append({
            "type": order_type,
            "price": close,
            "volume": float(candle["volume"]),
            "time": order_time,
            "wave_function": wave,
        })

    def visit(item, fallback_symbol="UNKNOWN"):
        if isinstance(item, list):
            for child in item:
                visit(child, fallback_symbol)
        elif isinstance(item, dict):
            if "result" in item:
                symbol = str(item.get("symbol", fallback_symbol))
                visit(item["result"], symbol)
            elif "close" in item and "time" in item:
                symbol = str(item.get("symbol", fallback_symbol))
                add_candle(symbol, item)

    visit(data)
    return orders_by_symbol


# ===============Função de onda Ψ=============== #
# 1. Separar ordens de compra e venda
def wave_function(orders):
    # Separar ordens de compra e venda
    buy_values = [o["wave_function"] for o in orders if o["type"] == "buy"]
    sell_values = [o["wave_function"] for o in orders if o["type"] == "sell"]

    # Probabilidade de próxima ordem ser compra (valor > 0)
    prob_buy = sum(1 for q in buy_values if q > 0) / len(buy_values) if buy_values else 0

    # Probabilidade de próxima ordem ser venda (valor < 0)
    prob_sell = sum(1 for q in sell_values if q < 0) / len(sell_values) if sell_values else 0

    return {
        "buy": prob_buy,
        "sell": prob_sell
    }

# ===============Função para calcular - Energia cinética (velocidade do preço)===============#
def calculate_kinetic_energy(orders, use_time=True, smooth=3, log_compress=True, avg_dt=None):
    """
    Energia cinética ~ movimento com volume.
    
    Parâmetros:
      use_time: se True, divide por Δt (para ticks irregulares).
                se False, ignora Δt (para candles regulares).
      smooth: janela de média móvel (0 = sem suavização).
      log_compress: aplica log1p para reduzir outliers.
      avg_dt: Δt de referência em segundos. Se None, usa a mediana dos Δt.
    """
    n = len(orders)
    if n == 0:
        return []

    prices  = np.array([o["price"]  for o in orders], dtype=float)
    volumes = np.array([o.get("volume", 0.0) for o in orders], dtype=float)
    times   = [o["time"] for o in orders]

    # Δt entre barras consecutivas (em segundos)
    dts = np.zeros(n)
    for i in range(1, n):
        dts[i] = (times[i] - times[i-1]).total_seconds()
    dts[0] = dts[1] if n > 1 else 1.0    # replica o primeiro

    # Δt de referência
    valid_dts = dts[dts > 0]
    if avg_dt is None:
        avg_dt = float(np.median(valid_dts)) if valid_dts.size > 0 else 1.0

    energy = np.zeros(n)
    for i in range(1, n):
        dp = prices[i] - prices[i-1]
        vol = volumes[i]

        if use_time:
            dt = dts[i] if dts[i] > 1e-6 else avg_dt
            # normaliza o Δt para não distorcer a escala
            e_c = vol * (dp ** 2) / dt * avg_dt
        else:
            e_c = vol * (dp ** 2)

        energy[i] = e_c

    # Comprime outliers (opcional)
    if log_compress and energy.max() > 0:
        energy = np.log1p(energy)

    # Suavização (opcional)
    if smooth and smooth > 1:
        kernel = np.ones(smooth) / smooth
        energy = np.convolve(energy, kernel, mode='same')

    return energy.tolist()

#===============Função para calcular energia potencial===============#
def calculate_Potential_energy(orders, window=500, k=1):
    prices  = np.array([o["price"]  for o in orders], dtype=float)
    volumes = np.array([o.get("volume", 0.0) for o in orders], dtype=float)
    n = len(prices)
    energies = np.zeros(n)

    # Pré-calcula referência de volume global (fallback)
    global_vol_mean = volumes[volumes > 0].mean() if (volumes > 0).any() else 0.0

    for i in range(window, n):
        wp = prices[i-window:i]
        equilibrium = wp.mean()
        sigma = wp.std()

        # --- z index ---
        if sigma < 1e-12 or sigma / (abs(equilibrium) + 1e-12) < 1e-9:
            # janela degenerada: usa apenas o sinal da variação
            z = 0.0 if prices[i] == equilibrium else np.sign(prices[i] - equilibrium)
        else:
            z = (prices[i] - equilibrium) / sigma
            z = np.clip(z, -10, 10)

        V = np.exp(-0.5 * z * z)   # em (0, 1]

        # --- volume seguro ---
        wv = volumes[i-window:i]
        vol_ref = wv[wv > 0].mean() if (wv > 0).any() else global_vol_mean

        if vol_ref <= 0 or volumes[i] <= 0:
            vol_factor = 0.5       # neutro, NÃO zera
        else:
            vol_ratio  = volumes[i] / vol_ref
            vol_factor = 0.3 + 0.7 * np.tanh(vol_ratio)   # ∈ [0.3, 1.0]

        energies[i] = k * V * vol_factor

    return energies.tolist()

# ==============Constante de Planck================#
def calculate_planck_constant(orders, alpha=0.1):
    # Extrair volumes
    volumes = [o["volume"] for o in orders]
    
    # Calcular média exponencial (EMA)
    ema = [volumes[0]]
    for v in volumes[1:]:
        ema.append(alpha * v + (1 - alpha) * ema[-1])
    
    # Constante de Planck do mercado = último valor da EMA
    h_market = ema[-1]
    return h_market, ema

# ===============Evolução de função de onda Ψ==============#
def evolve_wave_function(orders, h_market=1.0, 
                          drift_scale=1.0, 
                          osc_amplitude=0.005):
    psi = wave_function(orders)
    psi_buy  = float(psi["buy"])
    psi_sell = float(psi["sell"])

    kinetic   = calculate_kinetic_energy(orders)
    potential = calculate_Potential_energy(orders)

    n = min(len(kinetic), len(potential), len(orders))

    # Pré-calcula std do drift para normalizar
    drifts_raw = np.zeros(n)
    for i in range(1, n):
        p0 = orders[i-1]["price"]
        p1 = orders[i]["price"]
        drifts_raw[i] = (p1 - p0) / max(p0, 1e-9)
    drift_std = drifts_raw.std() if drifts_raw.std() > 1e-12 else 1.0

    evolution = []
    for i in range(n):
        H = kinetic[i] + potential[i]

        # Drift normalizado → em torno de [-1, 1]
        drift = drifts_raw[i] / drift_std
        drift = np.tanh(drift * drift_scale)

        # Oscilação: simétrica e atrelada ao estado
        oscillation = osc_amplitude * np.sin(i * 0.3 + H * 10.0)

        # Ganho simétrico: se drift>0, buy ganha mais; se <0, sell ganha mais
        delta = (H / h_market) * 0.1
        # O ganho de buy é proporcional a (1+drift),
        # o de sell a (1-drift). Se drift = -1, buy ganha 0.
        gain_buy  = delta * max(0.0, 1.0 + drift) + oscillation
        gain_sell = delta * max(0.0, 1.0 - drift) - oscillation

        psi_buy  = psi_buy  + gain_buy
        psi_sell = psi_sell + gain_sell

        # Clip ANTES de normalizar
        psi_buy  = max(0.0, psi_buy)
        psi_sell = max(0.0, psi_sell)

        # Normalização
        total = psi_buy + psi_sell
        if total > 1e-12:
            psi_buy  /= total
            psi_sell /= total
        else:
            psi_buy, psi_sell = 0.5, 0.5

        evolution.append({
            "ordem": i + 1,
            "psi_buy": psi_buy,
            "psi_sell": psi_sell,
            "H": H,
            "drift": drift,
            "oscillation": oscillation,
        })

    return evolution


# =============== TUNELAMENTO QUÂNTICO =============== #
def power_surges(orders, smooth=1, prominence=0.65):
    # Calcula energias
    kinetic   = calculate_kinetic_energy(orders)
    potential = calculate_Potential_energy(orders)

    n = min(len(kinetic), len(potential), len(orders))
    if n == 0:
        return []

    # Energia total
    H = np.array([kinetic[i] + potential[i] for i in range(n)])

    # Suavização opcional
    if smooth and smooth > 1:
        kernel = np.ones(smooth) / smooth
        H = np.convolve(H, kernel, mode="same")

    # Normalização
    H = (H - H.min()) / (H.max() - H.min() + 1e-9)

    # Detecta picos
    peaks, _ = find_peaks(H, prominence=prominence)

    # Associa cada pico ao preço, tempo e volume
    surge_points = []
    for idx in peaks:
        surge_points.append({
            "ordem": int(idx + 1),
            "energia": float(H[idx]),
            "power_surges_price": float(orders[idx]["price"]),
            "time": orders[idx]["time"].strftime("%Y-%m-%d %H:%M:%S"),
        })

    return surge_points

# ================Colapso da função de onda================#
def collapse_wave_function(evolution_series, potential_energy, energy_kinetic, orders):
    """
    Colapso da função de onda adaptado ao potencial suave (gaussiano).
    
    Regra:
      - Rompimento = potencial abaixo de um threshold relativo (percentil).
      - Direção = dada pelo movimento do preço (delta).
      - Colapso para estado definido (1,0) ou (0,1) na barra do rompimento.
      - Caso contrário, mantém psi_buy/psi_sell evoluídos.
    """
    n = len(evolution_series)
    if n == 0:
        return []

    # --- Calibra threshold de rompimento via percentil do próprio potencial ---
    # Ignora os primeiros zeros (i < window da calculate_Potential_energy)
    valid_pot = [p for p in potential_energy if p > 0]
    if valid_pot:
        # Percentil 15: ~15% das barras são "rompimento"
        pot_threshold = float(np.percentile(valid_pot, 15))
    else:
        pot_threshold = 0.0

    # --- Calibra threshold de energia cinética via mediana ---
    valid_kin = [k for k in energy_kinetic if k > 0]
    kin_percentil = np.percentile(valid_kin, 60) if valid_kin else 0.0

    collapsed_series = []

    for i, e in enumerate(evolution_series):
        H         = e["H"]
        psi_buy   = e["psi_buy"]
        psi_sell  = e["psi_sell"]
        buy, sell = psi_buy, psi_sell

        current_kinetic   = energy_kinetic[i]
        current_potential = potential_energy[i]

        price_current  = orders[i]["price"]
        price_previous = orders[i-1]["price"] if i > 0 else price_current
        delta_price    = price_current - price_previous

        # ---- 1) Detecta se há rompimento (potencial baixo) ----
        # i < window já vem com potential = 0 → considera "sem janela" = não rompimento
        is_breakout = (0 < current_potential < pot_threshold)

        # ---- 2) Determina a direção pelo preço ----
        flag_buy  = False
        flag_sell = False
        if is_breakout:
            if delta_price > 0:
                flag_buy = True
            elif delta_price < 0:
                flag_sell = True
            # delta == 0 → sem direção, não colapsa

        # ---- 3) Confirmação pela energia cinética (opcional) ----
        # Só colapsa se E_kin está acima da mediana (movimento real).
        # Se quiser colapso sempre que houver rompimento, apague este if.
        kin_ok = (current_kinetic >= kin_percentil)

        # ---- 4) Aplica o colapso ----
        collapsed = False
        if flag_buy and kin_ok:
            buy, sell = 1.0, 0.0
            collapsed = True
        elif flag_sell and kin_ok:
            buy, sell = 0.0, 1.0
            collapsed = True

        # ---- 5) Reporte ----
        if collapsed and flag_buy:
            rompimento = "alta"
        elif collapsed and flag_sell:
            rompimento = "baixa"
        elif is_breakout:
            rompimento = "sem_confirmacao"   # havia rompimento mas kin não confirmou
        else:
            rompimento = "nenhum"

        collapsed_series.append({
            "ordem": e["ordem"],
            "buy": buy,
            "sell": sell,
            "H": H,
            "potencial": current_potential,
            "rompimento": rompimento,
        })

    return collapsed_series

def _calculate_schrodinger(orders):

    peaks = power_surges(orders, smooth=1, prominence=0.65)

    higher_probability = wave_function(orders)

    energy_kinetic = calculate_kinetic_energy(orders)
    potential_energy = calculate_Potential_energy(orders, window=500, k=1.0)
    h_market, ema_series = calculate_planck_constant(orders)

    evolution_series = evolve_wave_function(orders, h_market)
    collapsed = collapse_wave_function(
        evolution_series, potential_energy, energy_kinetic, orders
    )
    for item in collapsed:
        order_index = item["ordem"] - 1
        if 0 <= order_index < len(orders):
            order_time = orders[order_index]["time"]
            item["time"] = order_time.strftime("%Y-%m-%d %H:%M:%S")


    return {
        "higher_probability": higher_probability,
        "energy_kinetic": list(map(float, energy_kinetic)),
        "potential_energy": list(map(float, potential_energy)),
        "h_market": float(h_market),
        "ema_series": list(map(float, ema_series)),
        "evolution_series": evolution_series,
        "collapsed": collapsed,
        "power_surges":peaks,
    }

def get_schrodinger(
    symbols=None,
    symbol=None,
    modo=None,
    time="15m",
    accumulation_period="month",
): 
    """Calcula o modelo separadamente para cada ativo recebido do VPPR."""
    vppr_data = get_vppr(
        symbols=symbols,
        symbol=symbol,
        modo=modo,
        time=time,
        accumulation_period=accumulation_period,
    )
    orders_by_symbol = normalize_vppr_data(vppr_data)
    results = {}

    for symbol, symbol_orders in orders_by_symbol.items():
        if not symbol_orders:
            continue
        try:
            results[symbol] = _calculate_schrodinger(symbol_orders)
        except Exception as exc:
            results[symbol] = {"error": str(exc)}

    return results
