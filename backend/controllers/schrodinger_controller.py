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
    waves = [float(o.get("wave_function", 0.0)) for o in orders]
    n_pos = sum(1 for w in waves if w > 0)
    n_neg = sum(1 for w in waves if w < 0)
    n_valid = n_pos + n_neg
    if n_valid == 0:
        return {"buy": 0.5, "sell": 0.5}
    return {
        "buy":  n_pos / n_valid,
        "sell": n_neg / n_valid,
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
def evolve_wave_function(orders,
                         window=10,
                         min_window=1):
    """
    Probabilidade frequentista simples de subida/queda numa janela móvel.

    - window: tamanho da janela (default 10)
    - min_window: mínimo de barras válidas (sobe+cai) para calcular;
                  abaixo disso retorna 0.5 / 0.5.
    - Barras com retorno 0 (preço parado) NÃO entram no denominador,
      para que psi_buy + psi_sell = 1.

    psi_buy  = n_sobe / (n_sobe + n_cai)
    psi_sell = n_cai  / (n_sobe + n_cai)
    """
    window     = max(1, int(window))
    min_window = max(1, int(min_window))
    if min_window > window:
        min_window = window

    n_total = len(orders)
    if n_total == 0:
        return []

    # --- Retornos por barra ---
    prices = np.array([o["price"] for o in orders], dtype=float)
    retornos = np.zeros(n_total)
    for i in range(1, n_total):
        retornos[i] = (prices[i] - prices[i-1]) / max(prices[i-1], 1e-9)

    evolution = []
    for i in range(n_total):
        start = max(0, i - window + 1)
        end   = i + 1
        ret_win = retornos[start:end]

        n_sobe  = int(np.sum(ret_win > 0))
        n_cai   = int(np.sum(ret_win < 0))
        n_zero  = int(np.sum(ret_win == 0))
        n_valid = n_sobe + n_cai

        if n_valid < min_window:
            psi_buy, psi_sell = 0.5, 0.5
        else:
            psi_buy  = n_sobe / n_valid
            psi_sell = n_cai  / n_valid

        evolution.append({
            "ordem": i + 1,
            "psi_buy": float(psi_buy),
            "psi_sell": float(psi_sell),
            "n_sobe": n_sobe,
            "n_cai": n_cai,
            "n_zero": n_zero,
            "n_total": n_valid,
            "retorno": float(retornos[i]),
        })

    return evolution
# =============== TUNELAMENTO QUÂNTICO =============== #
def power_surges(orders, smooth=1, prominence=0.20):
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

def _calculate_schrodinger(orders):
    peaks = power_surges(orders, smooth=1, prominence=0.65)

    higher_probability = wave_function(orders)

    # Energia cinética com time
    energy_kinetic = []
    raw_kinetic = calculate_kinetic_energy(orders)
    for i, e in enumerate(raw_kinetic):
        energy_kinetic.append({
            "value": float(e),
            "time": orders[i]["time"].strftime("%Y-%m-%d %H:%M:%S")
        })

    # Energia potencial com time
    potential_energy = []
    raw_potential = calculate_Potential_energy(orders, window=500, k=1.0)
    for i, e in enumerate(raw_potential):
        potential_energy.append({
            "value": float(e),
            "time": orders[i]["time"].strftime("%Y-%m-%d %H:%M:%S")
        })

    # Constante de Planck com série temporal
    h_market, ema_series = calculate_planck_constant(orders)
    ema_series_with_time = []
    for i, e in enumerate(ema_series):
        ema_series_with_time.append({
            "value": float(e),
            "time": orders[i]["time"].strftime("%Y-%m-%d %H:%M:%S")
        })

    # Evolução da função de onda com time
    evolution_series = evolve_wave_function(orders, window=100)
    for i, e in enumerate(evolution_series):
        e["time"] = orders[i]["time"].strftime("%Y-%m-%d %H:%M:%S")


    return {
        "higher_probability": higher_probability,
        "energy_kinetic": energy_kinetic,
        "potential_energy": potential_energy,
        "h_market": float(h_market),
        "ema_volume": ema_series_with_time,
        "evolution_series": evolution_series,
        "power_surges": peaks,
    }

def get_schrodinger(
    symbols=None,
    symbol=None,
    modo=None,
    time="1h",
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
