import { useEffect, useState } from "react";

const ControlPanel = ({ selectedDevices, setSelectedDevices }) => {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
  const fetchDevices = () => {
    fetch("http://localhost:8000/devices")
      .then(res => res.json())
      .then(data => {
        const unique = [...new Set(data.devices.map(d => d.device_id))];
        setDevices(unique);
      })
      .catch(err => console.error("Failed to fetch devices:", err));
  };

  fetchDevices(); // initial call

  const interval = setInterval(fetchDevices, 2000); // 🔥 every 2 sec

  return () => clearInterval(interval);
}, []);

  const toggleDevice = (id) => {
    if (selectedDevices.includes(id)) {
      setSelectedDevices(selectedDevices.filter(d => d !== id));
    } else {
      setSelectedDevices([...selectedDevices, id]);
    }
  };

  const selectAll = () => {
    setSelectedDevices(devices);
  };

  const clearAll = () => {
    setSelectedDevices([]);
  };

  return (
    <div style={{
      width: "260px",
      background: "#2B2D42",
      color: "#EDF2F4",
      padding: "15px",
      display: "flex",
      flexDirection: "column",
      gap: "15px",
      height: "100%",
      overflowY: "auto"
    }}>

      {/* Title */}
      <h3 style={{ margin: "0 0 10px", color: "#EDF2F4", fontSize: "1.1rem" }}>
        Device Selection
      </h3>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button 
          onClick={selectAll}
          style={{
            flex: 1,
            background: "#EF233C",
            border: "none",
            padding: "8px",
            borderRadius: "6px",
            cursor: "pointer",
            color: "#fff",
            fontSize: "0.85rem",
            fontWeight: "500"
          }}
        >
          Select All
        </button>
        <button 
          onClick={clearAll}
          style={{
            flex: 1,
            background: "#8D99AE",
            border: "none",
            padding: "8px",
            borderRadius: "6px",
            cursor: "pointer",
            color: "#1e293b",
            fontSize: "0.85rem",
            fontWeight: "500"
          }}
        >
          Clear
        </button>
      </div>

      {/* Devices List */}
      <div>
        <h4 style={{ color: "#8D99AE", margin: "0 0 10px", fontSize: "0.95rem" }}>
          Available Devices ({devices.length})
        </h4>

        <div style={{ maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}>
          {devices.length === 0 ? (
            <p style={{ color: "#8D99AE", fontSize: "0.9rem" }}>No devices found</p>
          ) : (
            devices.map(id => (
              <label
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px",
                  marginBottom: "8px",
                  background: selectedDevices.includes(id) ? "#374151" : "transparent",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  userSelect: "none"
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedDevices.includes(id)}
                  onChange={() => toggleDevice(id)}
                  style={{
                    marginRight: "10px",
                    cursor: "pointer",
                    width: "16px",
                    height: "16px"
                  }}
                />
                <span style={{ fontSize: "0.9rem" }}>{id}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Selected Count */}
      {selectedDevices.length > 0 && (
        <div style={{
          padding: "10px",
          background: "#374151",
          borderRadius: "6px",
          fontSize: "0.85rem",
          color: "#8D99AE"
        }}>
          {selectedDevices.length} device{selectedDevices.length !== 1 ? "s" : ""} selected
        </div>
      )}

    </div>
  );
};

export default ControlPanel;