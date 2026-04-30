import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import PageLayout from "./components/layout/PageLayout";
import Realtime from "./Pages/Realtime";
import Historian from "./Pages/Historian";
import Geospatial from "./Pages/Geospatial";
import Events from "./Pages/Events";

function App() {
  return (
    <Router>
      <PageLayout>
        <Routes>
          <Route path="/" element={<Realtime />} />
          <Route path="/historian" element={<Historian />} />
          <Route path="/geospatial" element={<Geospatial />} />
          <Route path="/events" element={<Events />} />
        </Routes>
      </PageLayout>
    </Router>
  );
}

export default App;