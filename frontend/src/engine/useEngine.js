import React from 'react'

const MarketEngineContext = React.createContext(null)

// MIG-F1: expose the external engine through context without making engine state provider state.
export const MarketEngineProvider = ({ engine, children }) => (
  React.createElement(MarketEngineContext.Provider, { value: engine }, children)
)

const useMarketEngine = () => {
  const engine = React.useContext(MarketEngineContext)
  if (!engine) {
    throw new Error('MarketEngine hooks must be used within a MarketEngineProvider.')
  }
  return engine
}

const useEngineValue = (getValue) => {
  const engine = useMarketEngine()
  const getSnapshot = React.useCallback(() => getValue(engine), [engine, getValue])

  return React.useSyncExternalStore(
    engine.subscribe,
    getSnapshot,
    getSnapshot,
  )
}

const getSnapshot = engine => engine.getSnapshot()
const getCursor = engine => engine.getCursor()
const getStatus = engine => engine.getStatus()
const getSpeed = engine => engine.getSpeed()
const getStep = engine => engine.getStep()
const getMaxCursor = engine => engine.getMaxCursor()

export const useEngineSnapshot = () => useEngineValue(getSnapshot)
export const useEngineFeed = (name) => {
  const engine = useMarketEngine()
  const getFeed = React.useCallback(() => engine.getFeed(name), [engine, name])
  return React.useSyncExternalStore(engine.subscribe, getFeed, getFeed)
}
export const useEngineCursor = () => useEngineValue(getCursor)
export const useEngineStatus = () => useEngineValue(getStatus)
export const useEngineSpeed = () => useEngineValue(getSpeed)
export const useEngineStep = () => useEngineValue(getStep)
export const useEngineMaxCursor = () => useEngineValue(getMaxCursor)

// MIG-F1: controls are memoized so consumers can retain stable action references.
export const useEngineControls = () => {
  const engine = useMarketEngine()
  return React.useMemo(() => ({
    play: engine.play,
    pause: engine.pause,
    continue: engine.play,
    reset: engine.reset,
    setSpeed: engine.setSpeed,
    setStep: engine.setStep,
    loadSources: engine.loadSources,
    updateSources: engine.updateSources,
  }), [engine])
}
