import { useEffect, useState } from 'react';
import ScheduleInputs from './components/ScheduleInputs.jsx';
import DirectCFInputs from './components/DirectCFInputs.jsx';
import { getBonds } from './lib/api.js';
import './styles.css';

export default function App() {
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBonds = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBonds();
      setBonds(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBonds();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Bond Calculator</h1>
        <p>Generate coupon schedules, upload custom cashflows, and run full pricing and risk analytics for fixed income instruments.</p>
        {error && <span className="error-text">{error}</span>}
      </header>
      <ScheduleInputs />
      <DirectCFInputs bonds={bonds} loadingBonds={loading} onUpload={loadBonds} />
    </div>
  );
}