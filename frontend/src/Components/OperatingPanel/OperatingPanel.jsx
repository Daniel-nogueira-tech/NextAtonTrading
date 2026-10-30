import React, { useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createChart, AreaSeries } from 'lightweight-charts';
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx';


import './OperatingPanel.css';
import PopUpConfirm from '../PopUpConfirm/PopUpConfirm.jsx';

const OperatingPanel = () => {
  const { resultOperations, logoutUser, showPopUp, actionType, setActionType, setShowPopUp, openLogoutConfirm } = React.useContext(ContextGraphics);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const areaSeriesRef = useRef(null);

  const formatNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
  };

  // ====================== GRÁFICO ======================
  const buildCapitalEvolution = (operationsEvolution, initialCapital = 10000) => {
    if (!Array.isArray(operationsEvolution) || operationsEvolution.length === 0) {
      return [];
    }

    const sortedOps = operationsEvolution
      .map(operation => {
        const exitDate = new Date(operation?.exitTime);
        const pnl = Number(operation?.pnl);
        if (Number.isNaN(exitDate.getTime()) || !Number.isFinite(pnl)) return null;

        return {
          date: exitDate.toISOString().slice(0, 10),
          timestamp: exitDate.getTime(),
          pnl,
        };
      })
      .filter(Boolean)
      .sort((first, second) => first.timestamp - second.timestamp);

    let capital = initialCapital;
    const dailyEvolution = new Map();

    sortedOps.forEach(operation => {
      capital += operation.pnl;
      dailyEvolution.set(operation.date, Number(capital.toFixed(2)));
    });

    return Array.from(dailyEvolution, ([time, value]) => ({ time, value }));
  };

  const operationsEvolution = resultOperations?.history?.operations;
  const capitalEvolution = useMemo(
    () => buildCapitalEvolution(operationsEvolution, 10000),
    [operationsEvolution]
  );

  useEffect(() => {
    if (!chartContainerRef.current) return undefined;

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

    chartRef.current = chart;
    areaSeriesRef.current = areaSeries;

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
      areaSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!areaSeriesRef.current) return;

    areaSeriesRef.current.setData(capitalEvolution);
    if (capitalEvolution.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [capitalEvolution]);



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

  const sumCapital = 
  Number(resultOperations?.capital?.balance ?? 0) + 
  Number(resultOperations?.results?.totalProfit ?? 0);


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
          <div className="op-card-value">$ {formatNumber(sumCapital)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Total Profit</span>
          <div className="op-card-value">{formatNumber(resultOperations?.results?.totalProfit)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Position Size</span>
          <div className="op-card-value">{formatNumber(resultOperations?.capital?.positionSize)}</div>
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
          <div className="op-card-value">{formatNumber(resultOperations?.results?.avgRisk)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Amount Risk</span>
          <div className="op-card-value">{formatNumber(resultOperations?.capital?.risk?.amount)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Risk Percentage Per Trade</span>
          <div className="op-card-value">{resultOperations?.capital?.risk?.percentage ?? 0}%</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Average Risk-Return</span>
          <div className="op-card-value">{formatNumber(resultOperations?.results?.avgRr)}</div>
        </div>
        <div className="op-card">
          <span className="op-card-title">Total Risk</span>
          <div className="op-card-value">{formatNumber(resultOperations?.results?.totalRisk)}</div>
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
            {(resultOperations?.probabilityDistribution?.distribution || []).map((item, index) => (
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
              {(operationsEvolution || []).map((op, index) => {
                const { symbol, entryTime, exitTime, entryPrice, exitPrice, stopPrice, side, rr, pnl } = op;

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
                      {formatNumber(entryPrice)}
                    </td>
                    <td className={`font-mono ${entryClass}`}>
                      {formatNumber(exitPrice)}
                    </td>
                    <td className="font-mono text-loss">
                      {formatNumber(stopPrice)}
                    </td>
                    <td className="font-mono">
                      {formatNumber(rr)}
                    </td>
                    <td className="font-mono">
                      {formatNumber(pnl)}
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