from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, date, timezone
import httpx
import asyncio
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Asteroid Risk Visualization API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# NASA API Configuration
NASA_API_KEY = os.environ.get('NASA_API_KEY')
NASA_BASE_URL = "https://api.nasa.gov/neo/rest/v1"

class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"

class EstimatedDiameter(BaseModel):
    kilometers_min: float
    kilometers_max: float
    meters_min: float
    meters_max: float

class RelativeVelocity(BaseModel):
    kilometers_per_hour: str
    kilometers_per_second: str
    miles_per_hour: str

class MissDistance(BaseModel):
    astronomical: str
    lunar: str
    kilometers: str
    miles: str

class CloseApproachData(BaseModel):
    close_approach_date: str
    close_approach_date_full: str
    epoch_date_close_approach: int
    relative_velocity: RelativeVelocity
    miss_distance: MissDistance
    orbiting_body: str

class Asteroid(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    neo_reference_id: str
    name: str
    nasa_jpl_url: str
    absolute_magnitude_h: float
    estimated_diameter: EstimatedDiameter
    is_potentially_hazardous_asteroid: bool
    close_approach_data: List[CloseApproachData]
    is_sentry_object: bool = False
    risk_level: RiskLevel = RiskLevel.LOW
    impact_probability: float = 0.0
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ImpactScenario(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asteroid_id: str
    impact_location: Dict[str, float]  # {"lat": float, "lng": float}
    estimated_damage_radius_km: float
    estimated_casualties: int
    impact_energy_megatons: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RiskAssessmentRequest(BaseModel):
    asteroid_neo_id: str
    impact_location: Dict[str, float]

# Helper functions
def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
            elif isinstance(value, dict):
                data[key] = prepare_for_mongo(value)
            elif isinstance(value, list):
                data[key] = [prepare_for_mongo(item) if isinstance(item, dict) else item for item in value]
    return data

def parse_from_mongo(item):
    """Convert ISO strings back to datetime objects"""
    if isinstance(item.get('last_updated'), str):
        item['last_updated'] = datetime.fromisoformat(item['last_updated'])
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    return item

def calculate_risk_level(asteroid_data: dict) -> RiskLevel:
    """Calculate risk level based on asteroid properties"""
    is_hazardous = asteroid_data.get('is_potentially_hazardous_asteroid', False)
    diameter_km = asteroid_data.get('estimated_diameter', {}).get('kilometers', {}).get('estimated_diameter_max', 0)
    
    # Get closest approach distance
    min_distance = float('inf')
    if asteroid_data.get('close_approach_data'):
        for approach in asteroid_data['close_approach_data']:
            distance_km = float(approach.get('miss_distance', {}).get('kilometers', '0').replace(',', ''))
            min_distance = min(min_distance, distance_km)
    
    # Risk assessment logic
    if is_hazardous and diameter_km > 1.0 and min_distance < 1000000:  # < 1M km
        return RiskLevel.CRITICAL
    elif is_hazardous and (diameter_km > 0.5 or min_distance < 5000000):  # < 5M km
        return RiskLevel.HIGH
    elif is_hazardous or diameter_km > 0.1:
        return RiskLevel.MODERATE
    else:
        return RiskLevel.LOW

def calculate_impact_energy(diameter_km: float, velocity_kms: float) -> float:
    """Calculate impact energy in megatons TNT equivalent"""
    # Simplified calculation: KE = 0.5 * mass * velocity^2
    # Assuming density of 2000 kg/m³ for asteroid
    density = 2000  # kg/m³
    radius_m = (diameter_km * 1000) / 2
    volume = (4/3) * 3.14159 * (radius_m ** 3)
    mass_kg = volume * density
    
    velocity_ms = velocity_kms * 1000
    kinetic_energy_joules = 0.5 * mass_kg * (velocity_ms ** 2)
    
    # Convert to megatons TNT (1 megaton = 4.184 × 10^15 joules)
    megatons = kinetic_energy_joules / (4.184e15)
    return megatons

async def fetch_neo_data(start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch NEO data from NASA API"""
    url = f"{NASA_BASE_URL}/feed"
    params = {
        'start_date': start_date,
        'end_date': end_date,
        'api_key': NASA_API_KEY
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()

@api_router.get("/")
async def root():
    return {"message": "Asteroid Risk Visualization API", "status": "active"}

@api_router.get("/asteroids/fetch")
async def fetch_asteroids(days_ahead: int = 7):
    """Fetch and store asteroid data from NASA API"""
    try:
        start_date = datetime.now().strftime('%Y-%m-%d')
        end_date = (datetime.now() + timedelta(days=days_ahead)).strftime('%Y-%m-%d')
        
        data = await fetch_neo_data(start_date, end_date)
        
        asteroids_processed = 0
        neo_objects = data.get('near_earth_objects', {})
        
        for date_key, asteroids in neo_objects.items():
            for asteroid_data in asteroids:
                # Process estimated diameter
                diameter_data = asteroid_data.get('estimated_diameter', {})
                estimated_diameter = EstimatedDiameter(
                    kilometers_min=diameter_data.get('kilometers', {}).get('estimated_diameter_min', 0),
                    kilometers_max=diameter_data.get('kilometers', {}).get('estimated_diameter_max', 0),
                    meters_min=diameter_data.get('meters', {}).get('estimated_diameter_min', 0),
                    meters_max=diameter_data.get('meters', {}).get('estimated_diameter_max', 0)
                )
                
                # Process close approach data
                close_approaches = []
                for approach in asteroid_data.get('close_approach_data', []):
                    close_approach = CloseApproachData(
                        close_approach_date=approach.get('close_approach_date', ''),
                        close_approach_date_full=approach.get('close_approach_date_full', ''),
                        epoch_date_close_approach=approach.get('epoch_date_close_approach', 0),
                        relative_velocity=RelativeVelocity(**approach.get('relative_velocity', {})),
                        miss_distance=MissDistance(**approach.get('miss_distance', {})),
                        orbiting_body=approach.get('orbiting_body', 'Earth')
                    )
                    close_approaches.append(close_approach)
                
                # Calculate risk level
                risk_level = calculate_risk_level(asteroid_data)
                
                asteroid = Asteroid(
                    neo_reference_id=asteroid_data.get('id', ''),
                    name=asteroid_data.get('name', ''),
                    nasa_jpl_url=asteroid_data.get('nasa_jpl_url', ''),
                    absolute_magnitude_h=asteroid_data.get('absolute_magnitude_h', 0),
                    estimated_diameter=estimated_diameter,
                    is_potentially_hazardous_asteroid=asteroid_data.get('is_potentially_hazardous_asteroid', False),
                    close_approach_data=close_approaches,
                    is_sentry_object=asteroid_data.get('is_sentry_object', False),
                    risk_level=risk_level
                )
                
                # Store in database
                asteroid_dict = prepare_for_mongo(asteroid.dict())
                
                # Check if asteroid already exists
                existing = await db.asteroids.find_one({"neo_reference_id": asteroid.neo_reference_id})
                if existing:
                    await db.asteroids.replace_one({"neo_reference_id": asteroid.neo_reference_id}, asteroid_dict)
                else:
                    await db.asteroids.insert_one(asteroid_dict)
                
                asteroids_processed += 1
        
        return {
            "message": f"Successfully processed {asteroids_processed} asteroids",
            "total_count": data.get('element_count', 0),
            "date_range": f"{start_date} to {end_date}"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching asteroid data: {str(e)}")

@api_router.get("/asteroids", response_model=List[Asteroid])
async def get_asteroids(risk_level: Optional[RiskLevel] = None, limit: int = 50):
    """Get asteroids with optional filtering by risk level"""
    query = {}
    if risk_level:
        query["risk_level"] = risk_level.value
    
    asteroids = await db.asteroids.find(query).limit(limit).to_list(length=None)
    return [Asteroid(**parse_from_mongo(asteroid)) for asteroid in asteroids]

@api_router.get("/asteroids/{neo_reference_id}", response_model=Asteroid)
async def get_asteroid(neo_reference_id: str):
    """Get specific asteroid by NEO reference ID"""
    asteroid = await db.asteroids.find_one({"neo_reference_id": neo_reference_id})
    if not asteroid:
        raise HTTPException(status_code=404, detail="Asteroid not found")
    return Asteroid(**parse_from_mongo(asteroid))

@api_router.post("/impact-scenario", response_model=ImpactScenario)
async def create_impact_scenario(request: RiskAssessmentRequest):
    """Create impact scenario for an asteroid"""
    # Get asteroid data
    asteroid = await db.asteroids.find_one({"neo_reference_id": request.asteroid_neo_id})
    if not asteroid:
        raise HTTPException(status_code=404, detail="Asteroid not found")
    
    # Calculate impact scenario
    diameter_km = asteroid['estimated_diameter']['kilometers_max']
    
    # Get velocity from close approach data
    velocity_kms = 20  # Default velocity in km/s
    if asteroid['close_approach_data']:
        velocity_kms = float(asteroid['close_approach_data'][0]['relative_velocity']['kilometers_per_second'])
    
    impact_energy = calculate_impact_energy(diameter_km, velocity_kms)
    
    # Estimate damage radius (simplified calculation)
    damage_radius_km = (impact_energy ** 0.33) * 2  # Rough approximation
    
    # Estimate casualties (very simplified - based on population density)
    area_affected = 3.14159 * (damage_radius_km ** 2)
    estimated_casualties = int(area_affected * 100)  # Assuming 100 people per km²
    
    scenario = ImpactScenario(
        asteroid_id=asteroid['neo_reference_id'],
        impact_location=request.impact_location,
        estimated_damage_radius_km=damage_radius_km,
        estimated_casualties=estimated_casualties,
        impact_energy_megatons=impact_energy
    )
    
    # Store scenario
    scenario_dict = prepare_for_mongo(scenario.dict())
    await db.impact_scenarios.insert_one(scenario_dict)
    
    return scenario

@api_router.get("/impact-scenarios", response_model=List[ImpactScenario])
async def get_impact_scenarios(limit: int = 20):
    """Get all impact scenarios"""
    scenarios = await db.impact_scenarios.find().limit(limit).to_list(length=None)
    return [ImpactScenario(**parse_from_mongo(scenario)) for scenario in scenarios]

@api_router.get("/stats")
async def get_stats():
    """Get dashboard statistics"""
    total_asteroids = await db.asteroids.count_documents({})
    hazardous_count = await db.asteroids.count_documents({"is_potentially_hazardous_asteroid": True})
    critical_risk = await db.asteroids.count_documents({"risk_level": "critical"})
    high_risk = await db.asteroids.count_documents({"risk_level": "high"})
    
    return {
        "total_asteroids": total_asteroids,
        "hazardous_asteroids": hazardous_count,
        "critical_risk_count": critical_risk,
        "high_risk_count": high_risk,
        "total_scenarios": await db.impact_scenarios.count_documents({})
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Add missing import
from datetime import timedelta