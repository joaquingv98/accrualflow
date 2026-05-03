import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import LandingPage from './pages/LandingPage';
import OcrTestPage from './pages/OcrTestPage';

function App() {
  return (
    <div className="min-h-screen bg-cream text-ink font-sans antialiased">
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/ocr-test" element={<OcrTestPage />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default App;
