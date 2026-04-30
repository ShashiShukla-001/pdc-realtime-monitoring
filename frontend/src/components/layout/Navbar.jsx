import { NavLink } from "react-router-dom";

const Navbar = () => {
  const linkStyle = ({ isActive }) => ({
    padding: "10px 20px",
    textDecoration: "none",
    color: isActive ? "#EDF2F4" : "#8D99AE",
    borderBottom: isActive ? "2px solid #EF233C" : "none",
    fontWeight: "500"
  });

  return (
    <div style={{
      display: "flex",
      background: "#2B2D42",
      padding: "10px 20px",
      borderBottom: "1px solid #444"
    }}>
      <NavLink to="/" style={linkStyle}>RealTime</NavLink>
      <NavLink to="/historian" style={linkStyle}>Historian</NavLink>
      <NavLink to="/geospatial" style={linkStyle}>Geospatial</NavLink>
      <NavLink to="/events" style={linkStyle}>Event Detection</NavLink>
    </div>
  );
};

export default Navbar;