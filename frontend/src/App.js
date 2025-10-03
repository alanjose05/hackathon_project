import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RiskBadge = ({ risk }) => {
  const getRiskColor = (risk) => {
    switch(risk) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'moderate': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRiskColor(risk)}`}>
      {risk.toUpperCase()}
    </span>
  );
};

const AsteroidCard = ({ asteroid, onCreateScenario }) => {
  const formatDistance = (distance) => {
    const km = parseFloat(distance.replace(/,/g, ''));
    if (km > 1000000) {
      return `${(km / 1000000).toFixed(2)}M km`;
    }
    return `${(km / 1000).toFixed(0)}K km`;
  };

  const closestApproach = asteroid.close_approach_data?.[0];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-800 truncate">
          {asteroid.name}
        </h3>
        <RiskBadge risk={asteroid.risk_level} />
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Diameter:</span>
          <span className="font-medium">
            {(asteroid.estimated_diameter.kilometers_min * 1000).toFixed(0)}-
            {(asteroid.estimated_diameter.kilometers_max * 1000).toFixed(0)}m
          </span>
        </div>
        
        {asteroid.is_potentially_hazardous_asteroid && (
          <div className="flex items-center justify-between">
            <span className="text-red-600 font-medium">⚠️ Potentially Hazardous</span>
          </div>
        )}
        
        {closestApproach && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-600">Closest Approach:</span>
              <span className="font-medium">{closestApproach.close_approach_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Miss Distance:</span>
              <span className="font-medium">{formatDistance(closestApproach.miss_distance.kilometers)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Velocity:</span>
              <span className="font-medium">
                {parseFloat(closestApproach.relative_velocity.kilometers_per_hour).toLocaleString()} km/h
              </span>
            </div>
          </>
        )}
      </div>
      
      <div className="mt-4 flex gap-2">
        <button 
          onClick={() => onCreateScenario(asteroid)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
        >
          Create Impact Scenario
        </button>
        <a 
          href={asteroid.nasa_jpl_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md text-sm font-medium text-center transition-colors"
        >
          NASA Details
        </a>
      </div>
    </div>
  );
};

const ImpactScenarioModal = ({ asteroid, isOpen, onClose, onSubmit }) => {
  const [location, setLocation] = useState({ lat: 40.7128, lng: -74.0060 }); // Default: NYC
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit(asteroid.neo_reference_id, location);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Create Impact Scenario</h3>
        <p className="text-sm text-gray-600 mb-4">
          Modeling potential impact of <strong>{asteroid?.name}</strong>
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Impact Location</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={location.lat}
                  onChange={(e) => setLocation({...location, lat: parseFloat(e.target.value)})}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={location.lng}
                  onChange={(e) => setLocation({...location, lng: parseFloat(e.target.value)})}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Default: New York City</p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Scenario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [asteroids, setAsteroids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingData, setFetchingData] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsteroid, setSelectedAsteroid] = useState(null);
  const [scenarios, setScenarios] = useState([]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchAsteroids = async (riskFilter = '') => {
    try {
      const params = riskFilter ? { risk_level: riskFilter } : {};
      const response = await axios.get(`${API}/asteroids`, { params });
      setAsteroids(response.data);
    } catch (error) {
      console.error('Error fetching asteroids:', error);
    }
  };

  const fetchScenariosData = async () => {
    try {
      const response = await axios.get(`${API}/impact-scenarios`);
      setScenarios(response.data);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
    }
  };

  const fetchNASAData = async () => {
    setFetchingData(true);
    try {
      const response = await axios.get(`${API}/asteroids/fetch`);
      alert(`Success: ${response.data.message}`);
      await fetchStats();
      await fetchAsteroids(selectedRisk);
    } catch (error) {
      alert(`Error: ${error.response?.data?.detail || error.message}`);
    }
    setFetchingData(false);
  };

  const createImpactScenario = async (asteroidId, location) => {
    try {
      const response = await axios.post(`${API}/impact-scenario`, {
        asteroid_neo_id: asteroidId,
        impact_location: location
      });
      alert('Impact scenario created successfully!');
      await fetchScenariosData();
      await fetchStats();
    } catch (error) {
      alert(`Error creating scenario: ${error.response?.data?.detail || error.message}`);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchStats(),
        fetchAsteroids(),
        fetchScenariosData()
      ]);
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    fetchAsteroids(selectedRisk);
  }, [selectedRisk]);

  const openScenarioModal = (asteroid) => {
    setSelectedAsteroid(asteroid);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Asteroid Risk Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🌌 Asteroid Risk Monitor</h1>
              <p className="text-gray-600 mt-1">Real-time NASA data visualization and impact modeling</p>
            </div>
            <button
              onClick={fetchNASAData}
              disabled={fetchingData}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {fetchingData ? '🔄 Fetching...' : '🚀 Update NASA Data'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.total_asteroids}</div>
              <div className="text-sm text-gray-600 mt-1">Total Asteroids</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-3xl font-bold text-orange-600">{stats.hazardous_asteroids}</div>
              <div className="text-sm text-gray-600 mt-1">Potentially Hazardous</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-3xl font-bold text-red-600">{stats.critical_risk_count}</div>
              <div className="text-sm text-gray-600 mt-1">Critical Risk</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-3xl font-bold text-yellow-600">{stats.high_risk_count}</div>
              <div className="text-sm text-gray-600 mt-1">High Risk</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-3xl font-bold text-purple-600">{stats.total_scenarios}</div>
              <div className="text-sm text-gray-600 mt-1">Impact Scenarios</div>
            </div>
          </div>
        )}

        {/* Risk Filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Risk Level:</label>
          <select 
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 bg-white"
          >
            <option value="">All Risk Levels</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="moderate">Moderate Risk</option>
            <option value="low">Low Risk</option>
          </select>
        </div>

        {/* Asteroids Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {asteroids.map((asteroid) => (
            <AsteroidCard 
              key={asteroid.id} 
              asteroid={asteroid} 
              onCreateScenario={openScenarioModal}
            />
          ))}
        </div>

        {asteroids.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌌</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No asteroids found</h3>
            <p className="text-gray-500 mb-4">Click "Update NASA Data" to fetch the latest asteroid information</p>
          </div>
        )}
      </div>

      {/* Impact Scenario Modal */}
      <ImpactScenarioModal 
        asteroid={selectedAsteroid}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={createImpactScenario}
      />
    </div>
  );
};

function App() {
  return <Dashboard />;
}

export default App;