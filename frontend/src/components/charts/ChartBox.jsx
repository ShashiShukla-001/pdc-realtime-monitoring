import "./ChartBox.css";

const ChartBox = ({ title, children }) => {
  return (
    <div className="chart-box">
      <h4 className="chart-box__title">{title}</h4>

      <div className="chart-box__content">
        {children}
      </div>
    </div>
  );
};

export default ChartBox;