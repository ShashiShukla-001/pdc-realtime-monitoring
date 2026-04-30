import ChartBox from "./ChartBox";
import LineChart from "./LineChart";
import PhasorChart from "./PhasorChart";
import "./DashboardGrid.css";

const DashboardGrid = ({ data }) => {
  return (
    <div className="dashboard-grid">

      <ChartBox title="Frequency">
        <LineChart data={data} field="frequency" />
      </ChartBox>

      <ChartBox title="Voltage Angle">
        <LineChart data={data} field="voltage_angle" />
      </ChartBox>

      <ChartBox title="Voltage Magnitude">
        <LineChart data={data} field="voltage_magnitude" />
      </ChartBox>

      <ChartBox title="Phasor Diagram">
        <PhasorChart data={data} />
      </ChartBox>

    </div>
  );
};

export default DashboardGrid;