import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

// Единственный скролл-контейнер приложения — Layout.jsx (Outlet обёрнут в
// него) — жест "потянуть вниз" ловится там, но данные грузит конкретная
// страница (Visits/Clients/Finance). Страница регистрирует свою функцию
// load() здесь; Layout вызывает её через trigger() при отпускании жеста.
const PullToRefreshContext = createContext(null);

export function PullToRefreshProvider({ children }) {
  const handlerRef = useRef(null);

  const register = useCallback((fn) => {
    handlerRef.current = fn;
    return () => {
      if (handlerRef.current === fn) handlerRef.current = null;
    };
  }, []);

  const trigger = useCallback(() => {
    return handlerRef.current ? Promise.resolve(handlerRef.current()) : Promise.resolve();
  }, []);

  const hasHandler = useCallback(() => !!handlerRef.current, []);

  return (
    <PullToRefreshContext.Provider value={{ register, trigger, hasHandler }}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

// Вызывается страницами со списками: usePullToRefresh(load), где load
// должен возвращать Promise (иначе индикатор обновления не узнает, когда
// скрыться).
export function usePullToRefresh(load) {
  const ctx = useContext(PullToRefreshContext);
  useEffect(() => {
    if (!ctx || !load) return undefined;
    return ctx.register(load);
  }, [ctx, load]);
}

export function usePullToRefreshController() {
  return useContext(PullToRefreshContext);
}
