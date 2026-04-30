import { useState } from "react";
import ControlPanel from "../components/controls/ControlPanel";
import DashboardGrid from "../components/charts/DashboardGrid";
import useWebSocket from "../hooks/useWebSocket";

const Realtime = () => {
  const [selectedDevices, setSelectedDevices] = useState([]);
  const data = useWebSocket();

  // filter selected devices
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) =>
      selectedDevices.length === 0 || selectedDevices.includes(key)
    )
  );


  return (
    <div style={{ display: "flex", height: "calc(100vh - 50px)", overflow: "hidden" }}>

      <ControlPanel
        selectedDevices={selectedDevices}
        setSelectedDevices={setSelectedDevices}
      />

      <div style={{ flex: 1, padding: "15px", background: "#0f172a", height: "100%" , overflow: "hidden", display: "flex", flexDirection: "column"}}>
        <DashboardGrid data={filteredData} />
      </div>

    </div>
  );
};

export default Realtime;