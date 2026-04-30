import ReactECharts from "echarts-for-react";

const PhasorChart = ({ data }) => {

  const points = Object.keys(data).map(device => {
    const latest = data[device]?.slice(-1)[0];

    if (!latest) return null;

    const rad = latest.voltage_angle * (Math.PI / 180);

return [
  latest.voltage_magnitude * Math.cos(rad),
  latest.voltage_magnitude * Math.sin(rad)
];
  }).filter(Boolean);

  const option = {
    animation: false,
    xAxis: { min: -2, max: 2 },
    yAxis: { min: -2, max: 2 },
    series: [{
      type: "scatter",
      data: points
    }]
  };

 return (
  <ReactECharts
    option={option}
    style={{ height: "100%", width: "100%" }}
    opts={{ renderer: "canvas" }}
  />
);
};

export default PhasorChart;