import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createChart, AreaSeries } from 'lightweight-charts';
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx';
import {
  mockStats,
  mockProbabilityDistribution,
  mockCapitalEvolution,
  mockLastOperations,
} from '../../OperatingData/operatingData.js';

import './OperatingPanel.css';
import PopUpConfirm from '../PopUpConfirm/PopUpConfirm.jsx';

const OperatingPanel = () => {
  const { resultOperations, trend, fullTrend, retestPointsState, logoutUser, showPopUp, actionType, setActionType, setShowPopUp, openLogoutConfirm } = React.useContext(ContextGraphics);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  // Helper para extrair valor
  const getOpValue = (opArray, key) => {
    if (!Array.isArray(opArray)) return 'N/A';
    const item = opArray.find(obj => obj?.name === key);
    return item ? item.value : 'N/A';
  };

  // Normaliza os dados para a tabela (flattening com símbolo)
  const tableOperations = useMemo(() => {
    if (!retestPointsState || retestPointsState.length === 0) {
      return mockLastOperations;
    }

    const allOps = [];

    retestPointsState.forEach(({ symbol, operations }) => {
      if (!operations || !Array.isArray(operations)) return;

      operations.forEach((opArray, idx) => {
        allOps.push({
          symbol,
          operation: opArray,
          id: `${symbol}-${idx}` // para key única
        });
      });
    });

    return allOps;
  }, [retestPointsState]);


  // ====================== GRÁFICO ======================
  const buildCapitalEvolution = (operationsEvolution, initialCapital = 10000) => {
    // Ordenar por tempo de saída
    const sortedOps = [...operationsEvolution].sort(
      (a, b) => new Date(a.exitTime) - new Date(b.exitTime)
    );
    let capital = initialCapital;

    return sortedOps.map(op => {
      capital += op.pnl;
      return {
        time: op.exitTime.split(" ")[0],
        value: Number(capital.toFixed(2))
      };
    });
  }
  const operationsEvolution = resultOperations?.history?.operations;
  const capitalEvolution = buildCapitalEvolution(operationsEvolution, 10000)

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: { background: { color: '#121214' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#1f1f23' }, horzLines: { color: '#1f1f23' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#3f3f46' },
      timeScale: { borderColor: '#3f3f46' },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#a855f7',
      topColor: 'rgba(168, 85, 247, 0.4)',
      bottomColor: 'rgba(168, 85, 247, 0.0)',
      lineWidth: 2,
    });

    areaSeries.setData(capitalEvolution);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);



  // Logout function
  const handleLogout = () => {
    if (typeof openLogoutConfirm === 'function') {
      openLogoutConfirm()
    } else {
      setActionType('logout')
      setShowPopUp(true)
    }
  }

  const closePopup = () => {
    setShowPopUp(false)
    setActionType('')
  }

  // Confirmação da ação
  const confirmAction = () => {
    switch (actionType) {
      case 'logout':
        logoutUser()
        break
      case 'delete':
        console.log('Item excluído')
        break
      default:
        console.log('Ação confirmada')
    }

    closePopup()
  }

  const summaryFields = [
    { key: 'stdDeviation', label: 'Standard Deviation' },
    { key: 'skewness', label: 'Skewness' },
    { key: 'maxReturn', label: 'Maximum Return' },
    { key: 'minReturn', label: 'Minimum Return' },
    { key: 'avgReturn', label: 'Average Return' },
    { key: 'avgPositiveReturn', label: 'Average Positive Return' },
    { key: 'avgNegativeReturn', label: 'Average Negative Return' }
  ];

  return (
    <div className="op-panel-container">

      {/* PopUp de Logout */}
      <PopUpConfirm
        isOpen={showPopUp && actionType === 'logout'}
        onClose={closePopup}
        onConfirm={confirmAction}
        title="Sair da Conta"
        message="Tem certeza que deseja sair? Você precisará fazer login novamente para acessar sua conta."
        confirmText="Sair"
        cancelText="Cancelar"
        icon={<svg xmlns="http://w3.org" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        }
        isDestructive={false}
      />

      <Link to="/">
        <div className="op-back-button" >
          {"↩ Back"}
        </div>
      </Link>

      {/*Logout*/}
      <div className="op-back-button" id="logout-button" onClick={handleLogout}>
        <svg xmlns="http://w3.org" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  >
          <path d="M10 22H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5"></path>
          <polyline points="17 16 21 12 17 8"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        Logout
      </div>

      {/* Header */}
      <header className="op-header">
        <h1>Operating <span className="accent-text">Panel</span></h1>
        <p>Performance analysis and quantitative execution metrics.</p>
      </header>
      {/* Grid Principal - Cards de Métricas */}
      <div className="op-stats-grid">
        <div className="op-card">
          <span className="op-card-title">Win Rate</span>
          <div className="op-card-value purple">{resultOperations?.history?.summary?.winRate ?? 0}%</div>
          <div className="op-progress-bar-wrapper">
            <div className="op-progress-bar-fill" style={{ width: `${resultOperations?.history?.summary?.winRate ?? 0}%` }}></div>
          </div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Capital</span>
          <div className="op-card-value">${(resultOperations?.capital?.balance + resultOperations?.results?.totalProfit).toFixed(2)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Total Profit</span>
          <div className="op-card-value">{resultOperations?.results?.totalProfit.toFixed(2) ?? 0}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Position Size</span>
          <div className="op-card-value">{resultOperations?.capital?.positionSize.toFixed(2) ?? 0}</div>
        </div>

        <div className="op-card">
          <span className="op-card-title">Total Operations</span>
          <div className="op-card-value">{resultOperations?.history?.summary?.totalOperations ?? 0}</div>
        </div>

        <div className="op-card">
          <span className="op-card-title win">Number of Wins</span>
          <div className="op-card-value green">{resultOperations?.history?.summary?.wins ?? 0}</div>
        </div>

        <div className="op-card">
          <span className="op-card-title loss">Number of Losses</span>
          <div className="op-card-value red">{resultOperations?.history?.summary?.losses ?? 0}</div>
        </div>

        {/**Results */}
        <div className="op-card">
          <span className="op-card-title">Average Risk</span>
          <div className="op-card-value">{resultOperations?.results?.avgRisk.toFixed(2) ?? 0}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Amount Risk</span>
          <div className="op-card-value">{resultOperations?.capital?.risk?.amount?.toFixed(2) ?? 0}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Risk Percentage Per Trade</span>
          <div className="op-card-value">{resultOperations?.capital?.risk?.percentage ?? 0}%</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Average Risk-Return</span>
          <div className="op-card-value">{resultOperations?.results?.avgRr.toFixed(2) ?? 0}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Total Risk</span>
          <div className="op-card-value">{resultOperations?.results?.totalRisk.toFixed(2) ?? 0}</div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="op-charts-grid">
        <div className="op-chart-card">
          <div>
            <h3 className="op-chart-title">Evolution of Capital</h3>
            <p className="op-chart-subtitle">Accumulated net worth curve</p>
          </div>
          <div ref={chartContainerRef} style={{ width: '100%', height: '300px' }} />
        </div>

        <div className="op-chart-card">
          <div>
            <h3 className="op-chart-title">Probability Distribution</h3>
            <p className="op-chart-subtitle">Frequency by return ranges</p>
          </div>
          <div className="op-distribution-list">
            {resultOperations?.probabilityDistribution?.distribution.map((item, index) => (
              <div key={index} className="op-dist-item">
                <div className="op-dist-info">
                  <span className="op-dist-range">{item.range}</span>
                  <span className="op-dist-count">{item.count} ops ({item.percentage}%)</span>
                </div>
                <div className="op-dist-bar-bg">
                  <div className="op-dist-bar-fill" style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
          {/* ====================== Dados adicionais ====================== */}
          <div className="summary-container">

            <table className="summary-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {summaryFields.map(({ key, label }) => {
                  const value = resultOperations?.probabilityDistribution?.summary?.[key];
                  return (
                    <tr key={key}>
                      <td className="metric-label">{label}</td>
                      <td className="metric-value">
                        {value !== undefined && value !== null ? value : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* ====================== TABELA ====================== */}
      <div className="op-chart-card">
        <div style={{ marginBottom: '16px' }}>
          <h3 className="op-chart-title">
            Latest Modulated Operations
            <span style={{ fontSize: '0.9rem', color: '#888', marginLeft: '12px' }}>
              ({resultOperations?.history?.operations?.length ?? 0} operations)
            </span>
          </h3>
          <p className="op-chart-subtitle">Real-time signals from multiple assets</p>
        </div>

        <div className="op-table-wrapper">
          <table className="op-table">
            <thead>
              <tr>
                <th>symbol</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Type</th>
                <th>Entry Price</th>
                <th>exit Price</th>
                <th>stop Price</th>
                <th>Risk-Return</th>
                <th>pnl</th>
              </tr>
            </thead>
            <tbody>
              {resultOperations?.history?.operations.map((op, index) => {
                const { symbol, action, entryTime, exitTime, entryPrice, exitPrice, stopPrice, side, rr, pnl } = op;

                // Definir classes de estilo
                const entryClass = side === "BUY" ? "text-win" : "text-loss";

                return (
                  <tr key={index}>
                    <td className="font-mono text-accent">{symbol}</td>
                    <td className="font-mono text-muted">{entryTime}</td>
                    <td className="font-mono text-muted">{exitTime}</td>
                    <td>
                      <span className="op-badge font-mono">{side}</span>
                    </td>
                    <td className="font-mono text-muted">
                      {Number(entryPrice).toFixed(2)}
                    </td>
                    <td className={`font-mono ${entryClass}`}>
                      {Number(exitPrice).toFixed(2)}
                    </td>
                    <td className="font-mono text-loss">
                      {Number(stopPrice).toFixed(2)}
                    </td>
                    <td className="font-mono">
                      {Number(rr).toFixed(2)}
                    </td>
                    <td className="font-mono">
                      {Number(pnl).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      </div>
    </div>
  );
};

export default OperatingPanel;