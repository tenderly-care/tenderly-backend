const axios = require('axios');

// Test configuration
const AI_AGENT_URL = 'http://localhost:8000/api/v1/diagnosis/structure';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0X3VzZXJfMTIzIiwidXNlcm5hbWUiOiJ0ZXN0X3VzZXIiLCJleHAiOjE3NTMzODAwMTIsImlhdCI6MTc1MzM3NjQxMn0.PMPUmf6Sewl_NKgs5rchIpFLethnCWPf4u9O84-SFFQ';

async function testAIAgentDirect() {
  console.log('🧪 Testing AI Agent Service Directly');
  console.log('=====================================\n');

  try {
    // Test data matching the format expected by the AI agent
    const testPayload = {
      structured_request: {
        patient_profile: {
          age: 28,
          request_id: "test_patient_001",
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

    console.log('📤 Sending request to AI agent...');
    console.log('URL:', AI_AGENT_URL);
    console.log('Payload structure:', Object.keys(testPayload.structured_request));

    const response = await axios.post(AI_AGENT_URL, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'X-API-Key': 'tenderly-api-key-2024-production-change-this',
        'X-Service-Name': 'tenderly-backend'
      },
      timeout: 30000
    });

    console.log('✅ AI Agent Response Received!');
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Data:');
    console.log(JSON.stringify(response.data, null, 2));

    // Check if it's a real AI response or fallback
    if (response.data.diagnosis && !response.data.diagnosis.includes('fallback')) {
      console.log('🎉 SUCCESS: Real AI diagnosis received from tenderly-ai-agent!');
    } else {
      console.log('⚠️  WARNING: This appears to be a fallback response');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📋 Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAIAgentDirect(); 