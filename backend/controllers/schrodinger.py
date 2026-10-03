import random
import datetime
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import gaussian_kde
from scipy.signal import find_peaks




# 1. Criar dados simulados para ordens
orders = []
base_price = 280
for i in range(100):
    price = base_price - i*2 + random.randint(-10, 10)  # tendência de alta
    order = {
        "type": random.choice(["buy", "sell"]),
        "price": price,
        "amount": random.randint(50, 505),
        "maximum": price + random.randint(20, 50),
        "minimum": price - random.randint(20, 50),
        "volume": random.randint(800, 2000),
        "time": datetime.datetime.now() + datetime.timedelta(seconds=i)
    }
    orders.append(order)

# Visualizar preços simulados
prices = [o["price"] for o in orders]
print(prices)


# ===============Função de onda Ψ=============== #
# 1. Separar ordens de compra e venda
def wave_function(orders):
    buy = [o["amount"] for o in orders if o["type"] == "buy"]
    sell = [o["amount"] for o in orders if o["type"] == "sell"]


    # 2. Calcular médias
    media_buy = sum(buy) / len(buy) if buy else 0
    media_sell = sum(sell) / len(sell) if sell else 0

    # 3. Calcular probabilidades
    higher_probability_buy = sum(1 for q in buy if q > media_buy) / len(buy) if buy else 0
    higher_probability_sell = sum(1 for q in sell if q > media_sell) / len(sell) if sell else 0

    return {
             "buy": higher_probability_buy,
             "sell":higher_probability_sell
            }

higher_probability = wave_function(orders)
print("Probabilidade ordem de compra > média:",higher_probability.get("buy"))
print("Probabilidade ordem de venda > média:",higher_probability.get("sell"))


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

energy_kinetic = calculate_kinetic_energy(orders)

# Mostrar resultados
for i, e in enumerate(energy_kinetic, start=1):
    print(f"Ordem {i}: Energia cinética = {e}")



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

potential_energy = calculate_Potential_energy(orders)

# Mostrar resultados
for i, e in enumerate(potential_energy, start=1):
    print(f"Ordem {i}: Energia potencial = {e}")

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

h_market, ema_series = calculate_planck_constant(orders)

print("Constante de Planck (mercado):", h_market)


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

# Evoluir função de onda
evolution_series = evolve_wave_function(orders, h_market)

# Mostrar resultados
for e in evolution_series:
    print(f"Ordem {e['ordem']}: Ψ_buy={e['psi_buy']:.4f}, Ψ_sell={e['psi_sell']:.4f}, H={e['H']:.2f}")



# =============Distribuição de Probabilidade com Hamiltoniano (Orbitais de Preço)==============#
def price_probability_distribution_kde_hamiltonian(orders):
    prices = np.array([o["price"] for o in orders])
    volumes = np.array([o["volume"] for o in orders])

    # Energias
    kinetic = calculate_kinetic_energy(orders)
    potential = calculate_Potential_energy(orders)
    hamiltonian = np.array([k + p for k, p in zip(kinetic, potential)])

    # Pesos = volume * energia
    weights = volumes[:len(hamiltonian)] * hamiltonian

    # Estimativa de densidade com pesos
    kde = gaussian_kde(prices[:len(weights)], weights=weights)
    x_grid = np.linspace(prices.min(), prices.max(), 200)
    probabilities = kde(x_grid)

    # Normalizar
    probabilities /= probabilities.sum()

    return x_grid, probabilities

# Calcular distribuição suave com Hamiltoniano
x_grid, probabilities = price_probability_distribution_kde_hamiltonian(orders)

# Plotar
plt.figure(figsize=(10,6))
plt.plot(x_grid, probabilities, color="purple", linewidth=2)
plt.title("Distribuição de Probabilidade com Hamiltoniano (Orbitais de Preço)")
plt.xlabel("Preço")
plt.ylabel("Probabilidade")
plt.grid(True)
plt.show()


#==================Calcular o valor esperado do preço==================#
def expectation_and_variance(x_grid, probabilities):
    expectation = np.sum(x_grid * probabilities)
    variance = np.sum(((x_grid - expectation) ** 2) * probabilities)
    std_dev = np.sqrt(variance)
    return expectation, variance, std_dev

# Calcular expectation e variância
expectation, variance, std_dev = expectation_and_variance(x_grid, probabilities)

# Detectar picos locais
peaks, _ = find_peaks(probabilities)
peak_prices = x_grid[peaks]
peak_probs = probabilities[peaks]

# Calcular Hamiltoniano médio em torno de cada pico
kinetic = calculate_kinetic_energy(orders)
potential = calculate_Potential_energy(orders)
hamiltonian = np.array([k + p for k, p in zip(kinetic, potential)])
prices = np.array([o["price"] for o in orders])

# Garantir alinhamento
n = min(len(prices), len(hamiltonian))
prices = prices[:n]
hamiltonian = hamiltonian[:n]

peak_energies = []
for p in peak_prices:
    # Janela de ±5% em torno do pico
    mask = (prices >= p*0.95) & (prices <= p*1.05)
    if mask.sum() > 0:
        avg_energy = hamiltonian[mask].mean()
    else:
        avg_energy = 0
    peak_energies.append(avg_energy)


# Plotar
plt.figure(figsize=(10,6))
plt.plot(x_grid, probabilities, color="purple", linewidth=2, label="Distribuição de Probabilidade")

# Valor esperado
plt.axvline(expectation, color="blue", linestyle="--", linewidth=2, label=f"Valor esperado = {expectation:.2f}")

# Faixa ±1σ
plt.fill_between(x_grid, 0, probabilities.max(),
                 where=(x_grid >= expectation - std_dev) & (x_grid <= expectation + std_dev),
                 color="blue", alpha=0.2, label=f"±1σ = {std_dev:.2f}")

# Picos locais com energia
for p, prob, energy in zip(peak_prices, peak_probs, peak_energies):
    plt.scatter(p, prob, color="red", s=100, zorder=5)
    plt.text(p, prob+0.001, f"E={energy:.1f}", ha="center", color="darkred")

plt.title("Orbitais de Preço com Expectation e Energia (Hamiltoniano)")
plt.xlabel("Preço")
plt.ylabel("Probabilidade")
plt.legend()
plt.grid(True)
plt.show()

print("Picos detectados (orbitais de preço):")
for p, prob, energy in zip(peak_prices, peak_probs, peak_energies):
    print(f"Preço ~ {p:.2f}, Probabilidade ~ {prob:.4f}, Energia média ~ {energy:.2f}")
