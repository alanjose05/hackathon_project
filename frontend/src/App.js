import React, { useState, useEffect, Suspense } from 'react';
import axios from 'axios';
import './App.css';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import 'leaflet/dist/leaflet.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Fix for Leaflet default markers
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// 3D Asteroid Component
const Asteroid3D = ({ diameter, position, color, name }) => {
  const meshRef = React.useRef();

  const radius = Math.log(diameter + 1) * 0.1; // Logarithmic scale for better visualization
  
  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial 
          color={color}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>
      <Text
        position={[0, radius + 0.2, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {name?.substring(1, name.length-1) || 'Unknown'}
      </Text>
      <Text
        position={[0, -radius - 0.2, 0]}
        fontSize={0.1}
        color="#888888"
        anchorX="center"
        anchorY="middle"
      >
        {diameter?.toFixed(0) || '0'}m
      </Text>
    </group>
  );
};

// Solar System Map Component
const SolarSystemMap = ({ asteroids }) => {
  const sunRef = React.useRef();
  
  // Planet data for reference
  const planets = [
    { name: 'Mercury', distance: 0.39, color: '#8C7853', size: 0.038 },
    { name: 'Venus', distance: 0.72, color: '#FFC649', size: 0.095 },
    { name: 'Earth', distance: 1.0, color: '#6B93D6', size: 0.1 },
    { name: 'Mars', distance: 1.52, color: '#C1440E', size: 0.053 }
  ];

  // Calculate asteroid orbital positions
  const getAsteroidPosition = (asteroid, index) => {
    // Estimate semi-major axis from close approach data (simplified)
    const closeApproach = asteroid.close_approach_data?.[0];
    if (!closeApproach) return [0, 0, 0];
    
    // Convert miss distance to approximate orbital distance
    const missDistanceKm = parseFloat(closeApproach.miss_distance.kilometers.replace(/,/g, ''));
    const distanceAU = Math.max(1.5, Math.min(4.0, missDistanceKm / 149597870.7 / 1000)); // Convert to AU, clamp between Mars and asteroid belt
    
    // Create orbital position
    const angle = (index * 23) * (Math.PI / 180); // Spread asteroids around orbit
    const x = Math.cos(angle) * distanceAU * 8; // Scale for visualization
    const z = Math.sin(angle) * distanceAU * 8;
    const y = (Math.random() - 0.5) * 2; // Some vertical variation
    
    return [x, y, z];
  };

  const getPlanetPosition = (planet, time = 0) => {
    const angle = time * (2 - planet.distance * 0.5); // Different orbital speeds
    const x = Math.cos(angle) * planet.distance * 8;
    const z = Math.sin(angle) * planet.distance * 8;
    return [x, 0, z];
  };

  const getRiskColor = (risk) => {
    switch(risk) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'moderate': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  return (
    <div className="h-96 bg-black rounded-lg overflow-hidden relative">
      <Canvas camera={{ position: [15, 10, 15], fov: 75 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[0, 0, 0]} intensity={2} color="#FDB813" />
        <OrbitControls enableZoom={true} />
        
        <Suspense fallback={null}>
          {/* Sun */}
          <mesh ref={sunRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshBasicMaterial color="#FDB813" />
          </mesh>
          <Text
            position={[0, -0.8, 0]}
            fontSize={0.3}
            color="#FDB813"
            anchorX="center"
          >
            SUN
          </Text>

          {/* Planetary Orbits */}
          {planets.map((planet, index) => (
            <group key={planet.name}>
              {/* Orbital path */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[planet.distance * 8 - 0.05, planet.distance * 8 + 0.05, 64]} />
                <meshBasicMaterial color="#333333" transparent opacity={0.3} />
              </mesh>
              
              {/* Planet */}
              <mesh position={getPlanetPosition(planet, 0)}>
                <sphereGeometry args={[planet.size, 16, 16]} />
                <meshStandardMaterial color={planet.color} />
              </mesh>
              
              {/* Planet label */}
              <Text
                position={[getPlanetPosition(planet, 0)[0], getPlanetPosition(planet, 0)[1] + 0.3, getPlanetPosition(planet, 0)[2]]}
                fontSize={0.15}
                color={planet.color}
                anchorX="center"
              >
                {planet.name}
              </Text>
            </group>
          ))}

          {/* Asteroid Belt Reference */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.2 * 8 - 0.1, 3.2 * 8 + 0.1, 64]} />
            <meshBasicMaterial color="#8B4513" transparent opacity={0.1} />
          </mesh>
          
          {/* Asteroids */}
          {asteroids.slice(0, 15).map((asteroid, index) => {
            const position = getAsteroidPosition(asteroid, index);
            const size = Math.max(0.05, Math.log(asteroid.estimated_diameter.meters_max + 1) * 0.02);
            
            return (
              <group key={asteroid.id}>
                <mesh position={position}>
                  <sphereGeometry args={[size, 8, 8]} />
                  <meshStandardMaterial 
                    color={getRiskColor(asteroid.risk_level)}
                    emissive={getRiskColor(asteroid.risk_level)}
                    emissiveIntensity={0.2}
                  />
                </mesh>
                
                <Text
                  position={[position[0], position[1] + size + 0.2, position[2]]}
                  fontSize={0.1}
                  color="white"
                  anchorX="center"
                >
                  {asteroid.name.substring(1, asteroid.name.length-1)}
                </Text>
                
                {/* Orbital trail */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[Math.sqrt(position[0]*position[0] + position[2]*position[2]) - 0.02, Math.sqrt(position[0]*position[0] + position[2]*position[2]) + 0.02, 32]} />
                  <meshBasicMaterial 
                    color={getRiskColor(asteroid.risk_level)} 
                    transparent 
                    opacity={0.2} 
                  />
                </mesh>
              </group>
            );
          })}

          {/* Reference Grid */}
          <gridHelper args={[50, 50, '#333333', '#222222']} />
          
          {/* Distance markers */}
          <Text position={[8, 0, 0]} fontSize={0.2} color="#666666">1 AU</Text>
          <Text position={[16, 0, 0]} fontSize={0.2} color="#666666">2 AU</Text>
          <Text position={[24, 0, 0]} fontSize={0.2} color="#666666">3 AU</Text>
        </Suspense>
      </Canvas>
      
      {/* Legend overlay */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded text-xs">
        <div className="font-bold mb-2">🌌 Solar System Map</div>
        <div className="space-y-1">
          <div><span className="w-3 h-3 bg-yellow-500 inline-block rounded mr-2"></span>Sun & Planets</div>
          <div><span className="w-3 h-3 bg-red-600 inline-block rounded mr-2"></span>High Risk Asteroids</div>
          <div><span className="w-3 h-3 bg-green-500 inline-block rounded mr-2"></span>Low Risk Asteroids</div>
          <div className="text-gray-400 mt-2">Mouse: Rotate • Wheel: Zoom</div>
        </div>
      </div>
    </div>
  );
};

// 3D Asteroid Viewer Component
const AsteroidViewer3D = ({ asteroids }) => {
  const positions = asteroids.map((_, index) => [
    (index % 5) * 2 - 4, // X position
    Math.floor(index / 5) * 2 - 2, // Y position  
    0 // Z position
  ]);

  const getRiskColor = (risk) => {
    switch(risk) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'moderate': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  return (
    <div className="h-96 bg-black rounded-lg overflow-hidden">
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <OrbitControls enableZoom={true} />
        
        <Suspense fallback={null}>
          {asteroids.slice(0, 10).map((asteroid, index) => (
            <Asteroid3D
              key={asteroid.id}
              diameter={asteroid.estimated_diameter.meters_max}
              position={positions[index]}
              color={getRiskColor(asteroid.risk_level)}
              name={asteroid.name.substring(1, asteroid.name.length-1)}
            />
          ))}
          
          {/* Reference objects for size comparison */}
          <mesh position={[-4, 0, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshStandardMaterial color="#60a5fa" />
          </mesh>
          <Text
            position={[-4, -0.2, 0]}
            fontSize={0.1}
            color="cyan"
            anchorX="center"
          >
            Human
          </Text>
          
          <mesh position={[-4, 2, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          <Text
            position={[-4, 1.6, 0]}
            fontSize={0.1}
            color="yellow"
            anchorX="center"
          >
            Building
          </Text>
        </Suspense>
      </Canvas>
    </div>
  );
};

// Trajectory Map Component
const TrajectoryMap = ({ asteroids, scenarios }) => {
  const mapCenter = [40.7128, -74.0060]; // NYC

  const getRiskColor = (risk) => {
    switch(risk) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c'; 
      case 'moderate': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  return (
    <div className="h-96 rounded-lg overflow-hidden">
      <MapContainer 
        center={mapCenter} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Asteroid approach trajectories */}
        {asteroids.slice(0, 20).map((asteroid, index) => {
          // Simulate trajectory points around Earth
          const angle = (index * 18) * (Math.PI / 180); // 18 degrees apart
          const distance = 40; // Distance from center
          const lat = mapCenter[0] + Math.sin(angle) * distance;
          const lng = mapCenter[1] + Math.cos(angle) * distance;
          
          return (
            <Marker key={asteroid.id} position={[lat, lng]}>
              <Popup>
                <div>
                  <strong>{asteroid.name}</strong><br/>
                  Risk: <span style={{ color: getRiskColor(asteroid.risk_level) }}>
                    {asteroid.risk_level.toUpperCase()}
                  </span><br/>
                  Diameter: {asteroid.estimated_diameter.meters_max.toFixed(0)}m<br/>
                  {asteroid.close_approach_data[0] && (
                    <>
                      Approach: {asteroid.close_approach_data[0].close_approach_date}<br/>
                      Distance: {(parseFloat(asteroid.close_approach_data[0].miss_distance.kilometers) / 1000).toFixed(0)}K km
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        
        {/* Impact scenarios */}
        {scenarios.map((scenario) => (
          <React.Fragment key={scenario.id}>
            <Marker position={[scenario.impact_location.lat, scenario.impact_location.lng]}>
              <Popup>
                <div className="text-red-800">
                  <strong>💥 Impact Scenario</strong><br/>
                  Asteroid: {scenario.asteroid_id}<br/>
                  Damage Radius: {scenario.estimated_damage_radius_km.toFixed(1)} km<br/>
                  Energy: {scenario.impact_energy_megatons.toFixed(1)} MT<br/>
                  Est. Casualties: {scenario.estimated_casualties.toLocaleString()}
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[scenario.impact_location.lat, scenario.impact_location.lng]}
              radius={scenario.estimated_damage_radius_km * 1000} // Convert km to meters
              pathOptions={{ 
                color: '#dc2626', 
                fillColor: '#fee2e2', 
                fillOpacity: 0.3,
                weight: 2
              }}
            />
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
};

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

        {/* Solar System Map - Full Width */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">🌌 Solar System Orbital Map</h2>
          <p className="text-gray-600 mb-4">
            Interactive 3D solar system showing real asteroid orbital positions around the Sun
          </p>
          <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">Loading Solar System...</div>}>
            <SolarSystemMap asteroids={asteroids} />
          </Suspense>
        </div>

        {/* Interactive Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🗺️ Earth Trajectory Map</h2>
            <p className="text-gray-600 mb-4">
              Interactive map showing asteroid approach paths and impact scenarios
            </p>
            <TrajectoryMap asteroids={asteroids} scenarios={scenarios} />
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🌍 3D Size Comparison</h2>
            <p className="text-gray-600 mb-4">
              3D visualization of asteroid sizes with interactive controls
            </p>
            <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">Loading 3D View...</div>}>
              <AsteroidViewer3D asteroids={asteroids} />
            </Suspense>
          </div>
        </div>

        {/* Impact Scenarios Section */}
        {scenarios.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🎯 Impact Scenarios</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenarios.map((scenario) => (
                <div key={scenario.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-red-800">Impact Scenario</h3>
                    <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                      {new Date(scenario.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Asteroid:</span>
                      <span className="font-medium text-red-700">{scenario.asteroid_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Location:</span>
                      <span className="font-medium">
                        {scenario.impact_location.lat.toFixed(2)}, {scenario.impact_location.lng.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Damage Radius:</span>
                      <span className="font-medium text-red-700">{scenario.estimated_damage_radius_km.toFixed(1)} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Impact Energy:</span>
                      <span className="font-medium text-red-700">{scenario.impact_energy_megatons.toFixed(1)} MT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Est. Casualties:</span>
                      <span className="font-medium text-red-700">{scenario.estimated_casualties.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <p className="text-xs text-red-600">
                      💥 Theoretical impact simulation based on asteroid properties
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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