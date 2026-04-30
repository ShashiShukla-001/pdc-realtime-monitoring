import Navbar from "./Navbar";

const PageLayout = ({ children }) => {
  return (
    <div style={{ background: "#0f172a", minHeight: "100vh" }}>
      <Navbar />
      {children}
    </div>
  );
};

export default PageLayout;