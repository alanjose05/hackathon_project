#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Asteroid Risk Visualization Platform
Tests NASA API integration, data storage, risk assessment, and impact scenarios
"""

import requests
import json
import time
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'https://asteroid-tracker-3.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

class AsteroidBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = 30
        self.test_results = []
        self.test_asteroid_id = None
        
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'details': details
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_api_health(self):
        """Test basic API connectivity"""
        try:
            response = self.session.get(f"{API_BASE}/")
            if response.status_code == 200:
                data = response.json()
                self.log_test("API Health Check", True, f"API is active: {data.get('message', 'Unknown')}")
                return True
            else:
                self.log_test("API Health Check", False, f"API returned status {response.status_code}")
                return False
        except Exception as e:
            self.log_test("API Health Check", False, f"Failed to connect to API: {str(e)}")
            return False
    
    def test_nasa_api_integration(self):
        """Test NASA API data fetching"""
        try:
            print("\n🚀 Testing NASA API Integration...")
            response = self.session.get(f"{API_BASE}/asteroids/fetch?days_ahead=3")
            
            if response.status_code == 200:
                data = response.json()
                asteroids_processed = data.get('total_count', 0)
                
                if asteroids_processed > 0:
                    self.log_test("NASA API Integration", True, 
                                f"Successfully fetched and processed {asteroids_processed} asteroids",
                                data)
                    return True
                else:
                    self.log_test("NASA API Integration", False, 
                                "No asteroids were processed from NASA API")
                    return False
            else:
                error_detail = response.text
                self.log_test("NASA API Integration", False, 
                            f"NASA API fetch failed with status {response.status_code}",
                            error_detail)
                return False
                
        except Exception as e:
            self.log_test("NASA API Integration", False, f"Exception during NASA API test: {str(e)}")
            return False
    
    def test_asteroid_retrieval(self):
        """Test asteroid data retrieval"""
        try:
            print("\n📡 Testing Asteroid Data Retrieval...")
            
            # Test getting all asteroids
            response = self.session.get(f"{API_BASE}/asteroids?limit=10")
            
            if response.status_code == 200:
                asteroids = response.json()
                
                if len(asteroids) > 0:
                    # Store first asteroid ID for later tests
                    self.test_asteroid_id = asteroids[0]['neo_reference_id']
                    
                    # Verify asteroid data structure
                    asteroid = asteroids[0]
                    required_fields = ['neo_reference_id', 'name', 'risk_level', 'estimated_diameter', 
                                     'is_potentially_hazardous_asteroid', 'close_approach_data']
                    
                    missing_fields = [field for field in required_fields if field not in asteroid]
                    
                    if not missing_fields:
                        self.log_test("Asteroid Data Retrieval", True, 
                                    f"Retrieved {len(asteroids)} asteroids with complete data structure")
                        return True
                    else:
                        self.log_test("Asteroid Data Retrieval", False, 
                                    f"Asteroid data missing required fields: {missing_fields}")
                        return False
                else:
                    self.log_test("Asteroid Data Retrieval", False, "No asteroids found in database")
                    return False
            else:
                self.log_test("Asteroid Data Retrieval", False, 
                            f"Failed to retrieve asteroids: status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Asteroid Data Retrieval", False, f"Exception during asteroid retrieval: {str(e)}")
            return False
    
    def test_specific_asteroid_lookup(self):
        """Test specific asteroid lookup by NEO reference ID"""
        if not self.test_asteroid_id:
            self.log_test("Specific Asteroid Lookup", False, "No test asteroid ID available")
            return False
            
        try:
            print(f"\n🔍 Testing Specific Asteroid Lookup for ID: {self.test_asteroid_id}")
            
            response = self.session.get(f"{API_BASE}/asteroids/{self.test_asteroid_id}")
            
            if response.status_code == 200:
                asteroid = response.json()
                
                # Verify it's the correct asteroid
                if asteroid['neo_reference_id'] == self.test_asteroid_id:
                    self.log_test("Specific Asteroid Lookup", True, 
                                f"Successfully retrieved asteroid: {asteroid['name']}")
                    return True
                else:
                    self.log_test("Specific Asteroid Lookup", False, 
                                "Retrieved asteroid ID doesn't match requested ID")
                    return False
            elif response.status_code == 404:
                self.log_test("Specific Asteroid Lookup", False, 
                            f"Asteroid {self.test_asteroid_id} not found in database")
                return False
            else:
                self.log_test("Specific Asteroid Lookup", False, 
                            f"Failed with status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Specific Asteroid Lookup", False, f"Exception during specific lookup: {str(e)}")
            return False
    
    def test_risk_filtering(self):
        """Test asteroid filtering by risk level"""
        try:
            print("\n⚠️ Testing Risk Level Filtering...")
            
            risk_levels = ['low', 'moderate', 'high', 'critical']
            filtering_works = True
            
            for risk_level in risk_levels:
                response = self.session.get(f"{API_BASE}/asteroids?risk_level={risk_level}&limit=5")
                
                if response.status_code == 200:
                    asteroids = response.json()
                    
                    # Check if all returned asteroids have the correct risk level
                    for asteroid in asteroids:
                        if asteroid['risk_level'] != risk_level:
                            filtering_works = False
                            break
                    
                    print(f"   {risk_level.upper()}: {len(asteroids)} asteroids")
                else:
                    filtering_works = False
                    break
            
            if filtering_works:
                self.log_test("Risk Level Filtering", True, "All risk level filters working correctly")
                return True
            else:
                self.log_test("Risk Level Filtering", False, "Risk level filtering not working properly")
                return False
                
        except Exception as e:
            self.log_test("Risk Level Filtering", False, f"Exception during risk filtering: {str(e)}")
            return False
    
    def test_dashboard_statistics(self):
        """Test dashboard statistics endpoint"""
        try:
            print("\n📊 Testing Dashboard Statistics...")
            
            response = self.session.get(f"{API_BASE}/stats")
            
            if response.status_code == 200:
                stats = response.json()
                
                required_stats = ['total_asteroids', 'hazardous_asteroids', 'critical_risk_count', 
                                'high_risk_count', 'total_scenarios']
                
                missing_stats = [stat for stat in required_stats if stat not in stats]
                
                if not missing_stats:
                    self.log_test("Dashboard Statistics", True, 
                                f"Statistics retrieved: {stats['total_asteroids']} total asteroids, "
                                f"{stats['hazardous_asteroids']} hazardous", stats)
                    return True
                else:
                    self.log_test("Dashboard Statistics", False, 
                                f"Missing statistics fields: {missing_stats}")
                    return False
            else:
                self.log_test("Dashboard Statistics", False, 
                            f"Statistics endpoint failed with status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Dashboard Statistics", False, f"Exception during statistics test: {str(e)}")
            return False
    
    def test_impact_scenario_creation(self):
        """Test impact scenario creation"""
        if not self.test_asteroid_id:
            self.log_test("Impact Scenario Creation", False, "No test asteroid ID available")
            return False
            
        try:
            print(f"\n💥 Testing Impact Scenario Creation for asteroid: {self.test_asteroid_id}")
            
            # Create impact scenario with realistic coordinates (New York City)
            scenario_data = {
                "asteroid_neo_id": self.test_asteroid_id,
                "impact_location": {
                    "lat": 40.7128,
                    "lng": -74.0060
                }
            }
            
            response = self.session.post(f"{API_BASE}/impact-scenario", 
                                       json=scenario_data,
                                       headers={'Content-Type': 'application/json'})
            
            if response.status_code == 200:
                scenario = response.json()
                
                required_fields = ['id', 'asteroid_id', 'impact_location', 'estimated_damage_radius_km',
                                 'estimated_casualties', 'impact_energy_megatons']
                
                missing_fields = [field for field in required_fields if field not in scenario]
                
                if not missing_fields:
                    self.log_test("Impact Scenario Creation", True, 
                                f"Created scenario with {scenario['estimated_damage_radius_km']:.2f}km damage radius, "
                                f"{scenario['impact_energy_megatons']:.2f} megatons energy", scenario)
                    return True
                else:
                    self.log_test("Impact Scenario Creation", False, 
                                f"Scenario missing required fields: {missing_fields}")
                    return False
            else:
                error_detail = response.text
                self.log_test("Impact Scenario Creation", False, 
                            f"Scenario creation failed with status {response.status_code}",
                            error_detail)
                return False
                
        except Exception as e:
            self.log_test("Impact Scenario Creation", False, f"Exception during scenario creation: {str(e)}")
            return False
    
    def test_impact_scenario_retrieval(self):
        """Test impact scenario retrieval"""
        try:
            print("\n📋 Testing Impact Scenario Retrieval...")
            
            response = self.session.get(f"{API_BASE}/impact-scenarios?limit=10")
            
            if response.status_code == 200:
                scenarios = response.json()
                
                if len(scenarios) > 0:
                    scenario = scenarios[0]
                    required_fields = ['id', 'asteroid_id', 'impact_location', 'estimated_damage_radius_km',
                                     'estimated_casualties', 'impact_energy_megatons', 'created_at']
                    
                    missing_fields = [field for field in required_fields if field not in scenario]
                    
                    if not missing_fields:
                        self.log_test("Impact Scenario Retrieval", True, 
                                    f"Retrieved {len(scenarios)} impact scenarios with complete data")
                        return True
                    else:
                        self.log_test("Impact Scenario Retrieval", False, 
                                    f"Scenarios missing required fields: {missing_fields}")
                        return False
                else:
                    self.log_test("Impact Scenario Retrieval", True, 
                                "No impact scenarios found (expected if none created yet)")
                    return True
            else:
                self.log_test("Impact Scenario Retrieval", False, 
                            f"Scenario retrieval failed with status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Impact Scenario Retrieval", False, f"Exception during scenario retrieval: {str(e)}")
            return False
    
    def test_risk_assessment_algorithm(self):
        """Test risk assessment calculations"""
        try:
            print("\n🎯 Testing Risk Assessment Algorithm...")
            
            # Get asteroids and verify risk calculations make sense
            response = self.session.get(f"{API_BASE}/asteroids?limit=20")
            
            if response.status_code == 200:
                asteroids = response.json()
                
                if len(asteroids) > 0:
                    risk_distribution = {'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
                    hazardous_high_risk = 0
                    total_hazardous = 0
                    
                    for asteroid in asteroids:
                        risk_level = asteroid['risk_level']
                        is_hazardous = asteroid['is_potentially_hazardous_asteroid']
                        
                        risk_distribution[risk_level] += 1
                        
                        if is_hazardous:
                            total_hazardous += 1
                            if risk_level in ['high', 'critical']:
                                hazardous_high_risk += 1
                    
                    # Basic validation: hazardous asteroids should generally have higher risk
                    risk_logic_valid = True
                    if total_hazardous > 0:
                        high_risk_ratio = hazardous_high_risk / total_hazardous
                        if high_risk_ratio < 0.3:  # At least 30% of hazardous should be high/critical risk
                            risk_logic_valid = False
                    
                    if risk_logic_valid:
                        self.log_test("Risk Assessment Algorithm", True, 
                                    f"Risk distribution appears logical: {risk_distribution}")
                        return True
                    else:
                        self.log_test("Risk Assessment Algorithm", False, 
                                    f"Risk assessment logic may be flawed. Distribution: {risk_distribution}")
                        return False
                else:
                    self.log_test("Risk Assessment Algorithm", False, "No asteroids available for risk assessment test")
                    return False
            else:
                self.log_test("Risk Assessment Algorithm", False, 
                            f"Failed to retrieve asteroids for risk assessment test")
                return False
                
        except Exception as e:
            self.log_test("Risk Assessment Algorithm", False, f"Exception during risk assessment test: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🧪 Starting Comprehensive Backend Testing for Asteroid Risk Visualization Platform")
        print(f"🌐 Testing against: {API_BASE}")
        print("=" * 80)
        
        # Test sequence
        tests = [
            self.test_api_health,
            self.test_nasa_api_integration,
            self.test_asteroid_retrieval,
            self.test_specific_asteroid_lookup,
            self.test_risk_filtering,
            self.test_dashboard_statistics,
            self.test_impact_scenario_creation,
            self.test_impact_scenario_retrieval,
            self.test_risk_assessment_algorithm
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ CRITICAL ERROR in {test.__name__}: {str(e)}")
                failed += 1
            
            time.sleep(1)  # Brief pause between tests
        
        print("\n" + "=" * 80)
        print("🏁 TESTING COMPLETE")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Success Rate: {(passed/(passed+failed)*100):.1f}%")
        
        return passed, failed, self.test_results

if __name__ == "__main__":
    tester = AsteroidBackendTester()
    passed, failed, results = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'passed': passed,
                'failed': failed,
                'success_rate': passed/(passed+failed)*100 if (passed+failed) > 0 else 0,
                'timestamp': datetime.now().isoformat()
            },
            'detailed_results': results
        }, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")