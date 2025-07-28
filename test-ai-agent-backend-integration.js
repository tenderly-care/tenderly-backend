const axios = require('axios');

// Test configuration
const BACKEND_URL = 'http://localhost:3000/api/v1';
const AI_AGENT_URL = 'http://localhost:8000/api/v1/diagnosis/structure';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6ImU2OWE1NGZjOWZmN2ZmNzkyM2RiZTZkMzllOGQ5OGE0MGM4MzM5MDViMTM1MmRjZDNhYWRmMjM4YWU2OWQ1NjAiLCJpYXQiOjE3NTM2MDQ1MzUsImV4cCI6MTc1MzYwNTQzNSwiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.VCjpbr-BzgFji7DWCzRJ1Yzzv-_R-13DdVhQ_fAMJys';

async function testBackendAIIntegration() {
  console.log('🧪 Testing Backend AI Integration Debug');
  console.log('========================================\n');

  try {
    // Step 1: Test AI agent directly with the same token the backend would use
    console.log('1️⃣ Testing AI agent with backend-style token...');
    
    // Generate a token similar to what the backend would generate
    const jwt = require('jsonwebtoken');
    const backendSecret = 'development_jwt_secret_key_change_in_production';
    const backendToken = jwt.sign({
      sub: 'tenderly-backend-service',
      username: 'backend-service',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      aud: 'ai-diagnosis-service',
      iss: 'tenderly-backend',
      service: true
    }, backendSecret, { algorithm: 'HS256' });

    console.log('Backend-style token generated:', backendToken.substring(0, 50) + '...');

    const testPayload = {
      structured_request: {
        patient_profile: {
          age: 28,
          request_id: "test_backend_integration_001",
          timestamp: new Date().toISOString()
        },
        primary_complaint: {
          main_symptom: "Irregular menstrual bleeding",
          duration: "3 weeks",
          severity: "moderate",
          onset: "gradual",
          progression: "worsening"
        },
        symptom_specific_details: {
          symptom_characteristics: {
            bleeding_pattern: "irregular",
            flow_intensity: "heavy",
            color: "bright red",
            clots: true,
            pain_associated: true
          }
        },
        reproductive_history: {
          pregnancy_status: {
            could_be_pregnant: false,
            pregnancy_test_result: "negative"
          },
          sexual_activity: {
            sexually_active: true,
            contraception_method: "condoms"
          },
          menstrual_history: {
            menarche_age: 13,
            cycle_frequency: 28,
            period_duration: 5
          }
        },
        associated_symptoms: {
          pain: {
            pelvic_pain: "intermittent",
            vulvar_irritation: "none"
          },
          systemic: {
            fatigue: "moderate",
            nausea: false,
            fever: false
          }
        },
        medical_context: {
          current_medications: [],
          recent_medications: [],
          medical_conditions: [],
          previous_gynecological_issues: ["PCOS"],
          allergies: [],
          family_history: ["diabetes", "hypertension"]
        },
        healthcare_interaction: {
          previous_consultation: false,
          consultation_outcome: "none",
          investigations_done: false,
          current_treatment: "none"
        },
        patient_concerns: {
          main_worry: "Fertility issues due to irregular periods",
          impact_on_life: "moderate",
          additional_notes: "Concerned about ability to conceive"
        }
      }
    };

    try {
      const aiResponse = await axios.post(AI_AGENT_URL, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendToken}`,
          'X-API-Key': 'tenderly-api-key-2024-production-change-this',
          'X-Service-Name': 'tenderly-backend'
        },
        timeout: 30000
      });

      console.log('✅ AI Agent works with backend-style token!');
      console.log('📊 Response status:', aiResponse.status);
      console.log('📊 Diagnosis:', aiResponse.data.possible_diagnoses?.[0]?.name || 'No diagnosis');
      console.log('');

    } catch (aiError) {
      console.log('❌ AI Agent failed with backend-style token');
      console.log('📊 Error status:', aiError.response?.status);
      console.log('📊 Error message:', aiError.response?.data?.detail || aiError.message);
      console.log('');
    }

    // Step 2: Test with the working token
    console.log('2️⃣ Testing AI agent with working token...');
    try {
      const workingToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0X3VzZXJfMTIzIiwidXNlcm5hbWUiOiJ0ZXN0X3VzZXIiLCJleHAiOjE3NTMzODAwMTIsImlhdCI6MTc1MzM3NjQxMn0.PMPUmf6Sewl_NKgs5rchIpFLethnCWPf4u9O84-SFFQ';
      
      const workingResponse = await axios.post(AI_AGENT_URL, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${workingToken}`,
          'X-API-Key': 'tenderly-api-key-2024-production-change-this',
          'X-Service-Name': 'tenderly-backend'
        },
        timeout: 30000
      });

      console.log('✅ AI Agent works with working token!');
      console.log('📊 Response status:', workingResponse.status);
      console.log('📊 Diagnosis:', workingResponse.data.possible_diagnoses?.[0]?.name || 'No diagnosis');
      console.log('');

    } catch (workingError) {
      console.log('❌ AI Agent failed with working token too');
      console.log('📊 Error status:', workingError.response?.status);
      console.log('📊 Error message:', workingError.response?.data?.detail || workingError.message);
      console.log('');
    }

    // Step 3: Test the backend endpoint
    console.log('3️⃣ Testing backend endpoint...');
    try {
      const backendResponse = await axios.post(`${BACKEND_URL}/consultations/symptoms/collect_detailed_symptoms`, testPayload.structured_request, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        timeout: 30000
      });

      console.log('✅ Backend endpoint responded!');
      console.log('📊 Response status:', backendResponse.status);
      console.log('📊 Diagnosis:', backendResponse.data.diagnosis);
      console.log('📊 Confidence score:', backendResponse.data.confidence_score);
      console.log('📊 Message:', backendResponse.data.message);
      console.log('');

      // Check if it's the fallback response
      if (backendResponse.data.message && backendResponse.data.message.includes('temporarily unavailable')) {
        console.log('⚠️  ISSUE FOUND: Backend is returning fallback response!');
        console.log('🔧 This means the AI agent call is failing in the backend.');
      } else {
        console.log('✅ Backend is returning real AI response!');
      }

    } catch (backendError) {
      console.log('❌ Backend endpoint failed');
      console.log('📊 Error status:', backendError.response?.status);
      console.log('📊 Error message:', backendError.response?.data?.message || backendError.message);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBackendAIIntegration(); 