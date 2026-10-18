import './AnalysisTools.css'

const TOOLS = [
  { id: 'cursor', label: 'Cursor', shortLabel: '➤', description: 'Move around the chart' },
  { id: 'trendline', label: 'Trend line', shortLabel: '／', description: 'Draw a trend line with two points' },
  { id: 'channel', label: 'Channel', shortLabel: '//', description: 'Draw a channel with three points' },
  { id: 'support', label: 'Support', shortLabel: '—', description: 'Draw a support level with one point' },
  { id: 'resistance', label: 'Resistance', shortLabel: '═', description: 'Draw a resistance level with one point' },
  { id: 'fibonacci', label: 'Fibonacci', shortLabel: 'ƒ', description: 'Draw Fibonacci retracement with two points' },
]

const AnalysisTools = ({ activeTool, onToolSelect, onClear }) => (
  <aside className="analysis-tools" aria-label="Analysis drawing tools">
    <span className="analysis-tools__heading">Tools</span>
    <span className="analysis-tools__hint">Select to move · Esc undo</span>
    <div className="analysis-tools__list">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`analysis-tools__button${activeTool === tool.id ? ' is-active' : ''}`}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          title={tool.description}
          onClick={() => onToolSelect(tool.id)}
        >
          <span className="analysis-tools__icon" aria-hidden="true">{tool.shortLabel}</span>
          <span className="analysis-tools__label">{tool.label}</span>
        </button>
      ))}
    </div>
    <button
      type="button"
      className="analysis-tools__clear"
      onClick={onClear}
      title="Remove all drawings"
    >
      Clear
    </button>
  </aside>
)

export default AnalysisTools
