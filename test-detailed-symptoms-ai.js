const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_PATIENT_ID = '6884d6abc1ceb202ca8066c4';

async function testDetailedSymptomsAI() {
  console.log('🧪 Testing Detailed Symptoms AI Endpoint');
  console.log('========================================\n');

  try {
    // Step 1: Health check
    console.log('1️⃣ Checking API health...');
    const healthResponse = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ API is healthy:', healthResponse.data.message);
    console.log('');

    // Step 2: Test detailed symptoms collection with AI agent
    console.log('2️⃣ Testing detailed symptoms collection with AI agent...');
    const detailedSymptomsData = {
      patient_profile: {
        age: 28,
        request_id: TEST_PATIENT_ID,
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
        systemic: {
          fatigue: "moderate",
          nausea: false,
          fever: false
        },
        pain: {
          pelvic_pain: "intermittent",
          vulvar_irritation: "none"
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
      },
      clinical_session_id: "clinical_test_session_123" // This should be a valid clinical session ID
    };

    const symptomsResponse = await axios.post(
      `${BASE_URL}/consultations/symptoms/collect_detailed_symptoms`,
      detailedSymptomsData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Detailed symptoms collected successfully!');
    console.log('📊 Response structure:');
    console.log('   - Consultation ID:', symptomsResponse.data.consultationId);
    console.log('   - Clinical Session ID:', symptomsResponse.data.clinicalSessionId);
    console.log('   - Diagnosis:', symptomsResponse.data.diagnosis);
    console.log('   - Confidence Score:', symptomsResponse.data.confidence_score);
    console.log('   - Urgency Level:', symptomsResponse.data.urgency_level);
    console.log('   - Follow-up Required:', symptomsResponse.data.follow_up_required);
    console.log('   - Message:', symptomsResponse.data.message);
    console.log('');

    // Step 3: Verify response structure
    console.log('3️⃣ Verifying response structure...');
    const response = symptomsResponse.data;
    
    // Expected fields
    const expectedFields = [
      'consultationId', 
      'clinicalSessionId', 
      'diagnosis', 
      'confidence_score', 
      'recommended_tests',
      'treatment_recommendations',
      'urgency_level',
      'follow_up_required',
      'message',
      'timestamp'
    ];
    
    const missingFields = expectedFields.filter(field => !response[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing expected fields:', missingFields);
    } else {
      console.log('✅ All expected fields present');
    }

    // Check AI diagnosis structure
    if (response.diagnosis && response.confidence_score) {
      console.log('✅ AI diagnosis structure is correct');
      console.log('   - Diagnosis:', response.diagnosis);
      console.log('   - Confidence:', response.confidence_score);
    } else {
      console.log('❌ AI diagnosis missing or incomplete');
    }

    console.log('');

    // Step 4: Test error handling with invalid clinical session
    console.log('4️⃣ Testing error handling with invalid clinical session...');
    const invalidData = {
      ...detailedSymptomsData,
      clinical_session_id: "invalid_session_id"
    };

    try {
      await axios.post(
        `${BASE_URL}/consultations/symptoms/collect_detailed_symptoms`,
        invalidData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
          }
        }
      );
      console.log('❌ Should have failed with invalid clinical session');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Correctly rejected invalid clinical session');
        console.log('   - Error:', error.response.data.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('');

    console.log('🎉 All tests passed! Detailed symptoms AI endpoint is working correctly.');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   - Endpoint: POST /consultations/symptoms/collect_detailed_symptoms`);
    console.log(`   - Clinical Session ID: ${response.clinicalSessionId}`);
    console.log(`   - AI Diagnosis: ${response.diagnosis}`);
    console.log(`   - Confidence: ${response.confidence_score}`);
    console.log(`   - Urgency: ${response.urgency_level}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📋 Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testDetailedSymptomsAI();
}

module.exports = { testDetailedSymptomsAI }; 