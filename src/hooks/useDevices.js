import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";

/**
 * Estado ao vivo dos devices via backend.
 * Carga inicial por REST; updates em tempo real por WebSocket (com reconnect).
 */
export function useDevices() {
  const [devices, setDevices] = useState([]);
  const [source, setSource] = useState(null); // "adb" | "mock"
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let alive = true;

    api
      .fetchDevices()
      .then(({ devices, source }) => {
        if (!alive) return;
        setDevices(devices);
        setSource(source);
      })
      .catch((e) => console.warn("fetchDevices:", e.message));

    const open = () => {
      const ws = api.connectWS((devs, src) => {
        setDevices(devs);
        if (src) setSource(src);
      });
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(open, 1500); // reconnect
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    };
    open();

    return () => {
      alive = false;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  return {
    devices,
    source,
    connected,
    runSuite: (ids) => api.runSuite(ids),
    deviceAction: (id, action) => api.deviceAction(id, action),
    provision: () => api.provision(),
  };
}
