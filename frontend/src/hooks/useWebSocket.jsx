import { useEffect, useState, useRef } from "react";

const useWebSocket = () => {
  const [data, setData] = useState({});
  const bufferRef = useRef({});   // 🔥 buffer (no re-render)

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");

    ws.onopen = () => {
      console.log("WebSocket connection opened");
    };

    ws.onmessage = (event) => {
  try {
    const messages = JSON.parse(event.data);

    messages.forEach(msg => {
      const device = msg.device_id;

      if (!bufferRef.current[device]) {
        bufferRef.current[device] = [];
      }

      bufferRef.current[device].push(msg);

      if (bufferRef.current[device].length > 50) {
        bufferRef.current[device].shift();
      }
    });

  } catch (error) {
    console.error("Parse error:", error);
  }
};

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason);
    };

    // 🔥 BATCH UPDATE every 100ms
    const interval = setInterval(() => {
      if (Object.keys(bufferRef.current).length === 0) return; // no new data
      setData(prev => {
        const updated = { ...prev };

        Object.keys(bufferRef.current).forEach(device => {
          const existing = updated[device] || [];

          updated[device] = [
            ...existing,
            ...bufferRef.current[device]
          ].slice(-50); // keep last 200 points
        });

        bufferRef.current = {}; // clear buffer
        return updated;
      });
    }, 150); // 👈 KEY (~7 FPS)

    return () => {
      console.log("Cleaning up WebSocket connection");
      ws.close();
      clearInterval(interval);
    };
  }, []);

  return data;
};

export default useWebSocket;