import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, AreaSeries } from 'lightweight-charts';
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx';
import {
  useOperatingData,
  mockStats,
  mockProbabilityDistribution,
  mockCapitalEvolution,
  mockLastOperations
} from '../../OperatingData/operatingData.js';

import './OperatingPanel.css';

const OperatingPanel = () => {
  const { trend, fullTrend } = React.useContext(ContextGraphics);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  
  const { retestPointsState } = useOperatingData(trend);

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

    areaSeries.setData(mockCapitalEvolution);
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

  return (
    <div className="op-panel-container">
      {/* Header */}
      <header className="op-header">
        <h1>Operating <span className="accent-text">Panel</span></h1>
        <p>Performance analysis and quantitative execution metrics.</p>
      </header>

      {/* Stats Grid (mantido igual) */}
      <div className="op-stats-grid">
        {/* ... seus cards de métricas ... */}
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
            {mockProbabilityDistribution.map((item, index) => (
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
        </div>
      </div>

      {/* ====================== TABELA ====================== */}
      <div className="op-chart-card">
        <div style={{ marginBottom: '16px' }}>
          <h3 className="op-chart-title">
            Latest Modulated Operations 
            <span style={{ fontSize: '0.9rem', color: '#888', marginLeft: '12px' }}>
              ({tableOperations.length} operations)
            </span>
          </h3>
          <p className="op-chart-subtitle">Real-time signals from multiple assets</p>
        </div>

        <div className="op-table-wrapper">
          <table className="op-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Strategy</th>
                <th className="text-right">Pivot</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Stop Loss</th>
              </tr>
            </thead>
            <tbody>
              {tableOperations.map(({ symbol, operation, id }) => {
                const type = getOpValue(operation, 'type');
                const time = getOpValue(operation, 'time');
                const pivo = getOpValue(operation, 'pivot') || getOpValue(operation, 'pivo');
                const buy = getOpValue(operation, 'buy' ) || getOpValue(operation, 'buyExit');
                const sell = getOpValue(operation, 'sell' ) || getOpValue(operation, 'sellExit');
                const stop = getOpValue(operation, 'stop');

                const entry = buy !== 'N/A' ? buy : sell;
                const entryClass = buy !== 'N/A' ? 'text-win' : 'text-loss';

                return (
                  <tr key={id}>
                    <td className="font-mono text-muted">{time}</td>
                    <td className="font-mono text-accent">{symbol}</td>
                    <td>
                      <span className="op-badge font-mono">{type}</span>
                    </td>
                    <td className="text-right font-mono text-muted">
                      {Number(pivo).toFixed(2)}
                    </td>
                    <td className={`text-right font-mono ${entryClass}`}>
                      {Number(entry).toFixed(2)}
                    </td>
                    <td className="text-right font-mono text-loss">
                      {Number(stop).toFixed(2)}
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