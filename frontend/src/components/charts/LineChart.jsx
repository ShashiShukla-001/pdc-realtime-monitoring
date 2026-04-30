import ReactECharts from "echarts-for-react";

const LineChart = ({ title, data, field }) => {

  
  const formatTime = (ts) => {
  const date = new Date(ts);
  return date.toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

  const getOption = () => {
    const MAX_POINTS = 50;
    const firstDevice = Object.keys(data)[0];
    const xAxisData =
  data[firstDevice]
    ?.slice(-MAX_POINTS)
    .map(d => formatTime(d.timestamp)) || [];

    const series = Object.keys(data).map(device => ({
      name: device,
      type: "line",
      showSymbol: false,
      data: data[device]
        .slice(-MAX_POINTS)
        .map(d => d[field])
    }));

    return {
      backgroundColor: "transparent",
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { textStyle: { color: "#EDF2F4" } },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisLabel: { color: "#8D99AE" }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#8D99AE" }
      },
      series
    };
  };

  return (
  <ReactECharts
    option={getOption()}
    style={{ height: "100%", width: "100%" }}
    opts={{ renderer: "canvas" }}
    notMerge={true}
    lazyUpdate={true}
  />
);
};

export default LineChart;