import random
import datetime
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import gaussian_kde
from scipy.signal import find_peaks
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
def calculate_kinetic_energy(orders):
    energy = []
    for i in range(1, len(orders)):
        price_current = orders[i]["price"]
        price_previous = orders[i-1]["price"]
        time_current = orders[i]["time"]
        time_previous = orders[i-1]["time"]
        vol_current = orders[i]["volume"]

        # ΔP e Δt
        delta_price = price_current - price_previous
        delta_time = (time_current - time_previous).total_seconds()

        # Energia cinética ~ (vol * ΔP^2 / Δt)
        if delta_time > 0:
            e_c = (vol_current * delta_price **2) / delta_time
            energy.append(e_c)
        else:                        
            energy.append(0)

    return energy


#===============Função para calcular energia potencial===============#
def calculate_Potential_energy(orders, max_expansao_pct=0.1):
    if not orders:
        return []

    p_min = orders[0]["price"]
    p_max = orders[0]["price"]
    track_volume = 0
    energies = []

    for o in orders:
        price = o["price"]
        vol = o["volume"]

        nova_min = min(p_min, price)
        nova_max = max(p_max, price)
        amplitude_atual = p_max - p_min
        amplitude_nova = nova_max - nova_min

        # Se a expansão for pequena → ainda é consolidação
        if amplitude_atual == 0 or (amplitude_nova - amplitude_atual) / max(amplitude_atual, 1e-9) <= max_expansao_pct:
            p_min, p_max = nova_min, nova_max
            track_volume += vol
            e_p = (p_max - p_min) * track_volume
            energies.append(e_p)
        else:
            # Rompeu → fecha a consolidação e reinicia
            energies.append(0)
            p_min = p_max = price
            track_volume = vol

    return energies


# ==============Calcular energia potencial================#
# Constante de Planck
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



# ===============Evolução de função de onda==============#
def evolve_wave_function(orders, h_market):
    # Função de onda inicial
    psi = wave_function(orders)
    psi_buy = psi["buy"]
    psi_sell = psi["sell"]

    kinetic = calculate_kinetic_energy(orders)
    potential = calculate_Potential_energy(orders)

    evolution = []
    for i in range(min(len(kinetic), len(potential))):
        H = kinetic[i] + potential[i]
        price_current = orders[i]["price"]
        price_previous = orders[i-1]["price"] if i > 0 else price_current

        # Drift proporcional à variação de preço
        drift = (price_current - price_previous) / max(price_previous,1)

        # Oscilação senoidal (interferência quântica)
        oscillation = 0.05 * np.sin(i * 0.3)  # amplitude 0.05, frequência 0.3

        # Atualização com viés + oscilação
        psi_buy += (H / h_market) * 0.1 * (1 + drift) + oscillation
        psi_sell += (H / h_market) * 0.1 * (1 - drift) - oscillation

        # Normalização
        total = psi_buy + psi_sell
        psi_buy /= total
        psi_sell /= total

        # Limitar entre 0 e 1
        psi_buy = max(0, min(1, psi_buy))
        psi_sell = max(0, min(1, psi_sell))

        evolution.append({"ordem": i+1, "psi_buy": psi_buy, "psi_sell": psi_sell, "H": H, "oscillation": oscillation})

    return evolution


# =============Distribuição de Probabilidade com Hamiltoniano (Orbitais de Preço)==============#
def analyze_price_orbitals(orders, alpha=0.00005, grid_points=200):
    # Extrair preços e volumes
    prices = np.array([o["price"] for o in orders])
    volumes = np.array([o["volume"] for o in orders])

    # Energias
    kinetic = calculate_kinetic_energy(orders)
    potential = calculate_Potential_energy(orders)
    hamiltonian = np.array([k + p for k, p in zip(kinetic, potential)])

    # Distribuição de probabilidade (KDE com pesos)
    weights = volumes[:len(hamiltonian)] * hamiltonian
    kde = gaussian_kde(prices[:len(weights)], weights=weights)
    x_grid = np.linspace(prices.min(), prices.max(), grid_points)
    probabilities = kde(x_grid)
    probabilities /= probabilities.sum()  # normalizar

    # Expectation e variância
    expectation = np.sum(x_grid * probabilities)
    variance = np.sum(((x_grid - expectation) ** 2) * probabilities)
    std_dev = np.sqrt(variance)

    # Detectar picos locais
    peaks, _ = find_peaks(probabilities)
    peak_prices = x_grid[peaks]
    peak_probs = probabilities[peaks]

    # Calcular energia média em torno dos picos
    n = min(len(prices), len(hamiltonian))
    prices = prices[:n]
    hamiltonian = hamiltonian[:n]

    peak_energies = []
    for p in peak_prices:
        mask = (prices >= p*0.95) & (prices <= p*1.05)
        avg_energy = hamiltonian[mask].mean() if mask.sum() > 0 else 0
        peak_energies.append(avg_energy)

    # Definir barreiras
    barrier_resistencia = np.percentile(hamiltonian, 90)
    barrier_suporte = np.percentile(hamiltonian, 10)

    # Função de tunelamento
    def tunneling_probability(H, barrier):
        if H >= barrier:
            return 1.0
        else:
            return np.exp(-alpha * (barrier - H))

    # Calcular regiões de pico com tunelamento
    peak_regions = []
    for p in peak_prices:
        mask = (prices >= p - std_dev) & (prices <= p + std_dev)
        if mask.sum() > 0:
            avg_energy_region = hamiltonian[mask].mean()
            prob_resistencia = tunneling_probability(avg_energy_region, barrier_resistencia)
            prob_suporte = tunneling_probability(avg_energy_region, barrier_suporte)
        else:
            avg_energy_region, prob_resistencia, prob_suporte = 0, 0, 0

        peak_regions.append({
            "preco_pico": p,
            "prob_pico": probabilities[np.argmin(np.abs(x_grid - p))],
            "preco_min": p - std_dev,
            "preco_max": p + std_dev,
            "energia_media": avg_energy_region,
            "P_resistencia": prob_resistencia,
            "P_suporte": prob_suporte
        })

    # Retornar resultados organizados
    return {
        "x_grid": x_grid,
        "probabilities": probabilities,
        "expectation": expectation,
        "variance": variance,
        "std_dev": std_dev,
        "peak_prices": peak_prices,
        "peak_probs": peak_probs,
        "peak_energies": peak_energies,
        "peak_regions": peak_regions,
        "barrier_resistencia": barrier_resistencia,
        "barrier_suporte": barrier_suporte
    }


# ================Colapso da função de onda================#
def collapse_wave_function(evolution_series, potential_energy, energy_kinetic):
    collapsed_series = []
    flag_collapsed_buy = False
    flag_collapsed_sell = False

    for i, e in enumerate(evolution_series):
        H = e["H"]
        psi_buy = e["psi_buy"]
        psi_sell = e["psi_sell"]

        buy, sell = psi_buy, psi_sell

        current_kinetic = energy_kinetic[i]
        prev_kinetic = energy_kinetic[i-1] if i > 0 else current_kinetic
        current_potential = potential_energy[i]

        # Detecta rompimento (energia potencial zerada)
        if current_potential == 0:
            if psi_buy > 0.5:
                flag_collapsed_buy = True
            elif psi_sell > 0.5:
                flag_collapsed_sell = True

        # Se houve colapso, analisar energia cinética
        if flag_collapsed_buy and prev_kinetic < current_kinetic:
            # Energia cinética aumentando → colapso para compra
            buy, sell = 1.0, 0.0
        elif flag_collapsed_sell and prev_kinetic < current_kinetic:
            # Energia cinética aumentando → colapso para venda
            buy, sell = 0.0, 1.0

        collapsed_series.append({
            "ordem": e["ordem"],
            "buy": buy,
            "sell": sell,
            "H": H
        })

    return collapsed_series



def _calculate_schrodinger(orders):
    print('orders:',orders)
    higher_probability = wave_function(orders)

    energy_kinetic = calculate_kinetic_energy(orders)
    potential_energy = calculate_Potential_energy(orders)
    h_market, ema_series = calculate_planck_constant(orders)

    evolution_series = evolve_wave_function(orders, h_market)
    price_orbitals = analyze_price_orbitals(orders)
    collapsed = collapse_wave_function(
        evolution_series, potential_energy, energy_kinetic
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
        "price_orbitals": {
            "x_grid": price_orbitals["x_grid"].tolist(),
            "probabilities": price_orbitals["probabilities"].tolist(),
            "expectation": float(price_orbitals["expectation"]),
            "variance": float(price_orbitals["variance"]),
            "std_dev": float(price_orbitals["std_dev"]),
            "peak_prices": price_orbitals["peak_prices"].tolist(),
            "peak_probs": price_orbitals["peak_probs"].tolist(),
            "peak_energies": list(map(float, price_orbitals["peak_energies"])),
            "peak_regions": price_orbitals["peak_regions"],
            "barrier_resistencia": float(price_orbitals["barrier_resistencia"]),
            "barrier_suporte": float(price_orbitals["barrier_suporte"]),
        }
    }

def get_schrodinger(
    symbols=None,
    symbol=None,
    modo="real",
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
