const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const AUTH_TOKEN = 'your-jwt-token-here'; // Replace with actual JWT token

const testStructuredAssessment = async () => {
  try {
    console.log('🧪 Testing Structured Gynecological Assessment Endpoint');
    console.log('==================================================');

    const testData = {
      structured_request: {
        patient_profile: {
          age: 25,
          request_id: "test_structure_001",
          timestamp: "2025-07-22T10:51:50Z"
        },
        primary_complaint: {
          main_symptom: "irregular periods",
          duration: "3 days",
          severity: "moderate",
          onset: "sudden",
          progression: "stable"
        },
        symptom_specific_details: {
          symptom_characteristics: {
            cycle_length_range: "21–45 days",
            bleeding_duration_variability: "2–10 days",
            bleeding_intensity: "sometimes heavy",
            bleeding_between_periods: true,
            skipped_periods: "twice in last 6 months"
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
            menarche_age: 12,
            cycle_frequency: 28,
            period_duration: 5
          }
        },
        associated_symptoms: {
          pain: {
            pelvic_pain: "mild",
            vulvar_irritation: "moderate"
          },
          systemic: {
            fatigue: "none",
            nausea: false,
            fever: false
          }
        },
        medical_context: {
          current_medications: [],
          recent_medications: [],
          medical_conditions: ["diabetes"],
          previous_gynecological_issues: [],
          allergies: ["penicillin"],
          family_history: []
        },
        healthcare_interaction: {
          previous_consultation: true,
          consultation_outcome: "inconclusive",
          investigations_done: false,
          current_treatment: "none"
        },
        patient_concerns: {
          main_worry: "recurrent infections",
          impact_on_life: "moderate",
          additional_notes: "I have multiple drug allergies"
        }
      }
    };

    console.log('📤 Sending structured assessment request...');
    console.log('Request data:', JSON.stringify(testData, null, 2));

    const response = await axios.post(
      `${BASE_URL}/consultations/symptoms/collect-structured`,
      testData,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('\n✅ Request successful!');
    console.log('Status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    // Validate response structure
    const requiredFields = [
      'request_id',
      'patient_age',
      'primary_symptom',
      'possible_diagnoses',
      'clinical_reasoning',
      'differential_considerations',
      'safety_assessment',
      'risk_assessment',
      'recommended_investigations',
      'treatment_recommendations',
      'patient_education',
      'warning_signs',
      'confidence_score',
      'processing_notes',
      'disclaimer',
      'timestamp',
      'sessionId',
      'consultationPricing'
    ];

    console.log('\n🔍 Validating response structure...');
    const missingFields = requiredFields.filter(field => !(field in response.data));
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
    } else {
      console.log('✅ All required fields present');
    }

    // Validate specific fields
    if (response.data.possible_diagnoses && Array.isArray(response.data.possible_diagnoses)) {
      console.log('✅ possible_diagnoses is an array with', response.data.possible_diagnoses.length, 'items');
    } else {
      console.log('❌ possible_diagnoses is missing or not an array');
    }

    if (response.data.confidence_score && typeof response.data.confidence_score === 'number') {
      console.log('✅ confidence_score is a number:', response.data.confidence_score);
    } else {
      console.log('❌ confidence_score is missing or not a number');
    }

    if (response.data.risk_assessment?.urgency_level) {
      console.log('✅ urgency_level present:', response.data.risk_assessment.urgency_level);
    } else {
      console.log('❌ urgency_level is missing');
    }

    console.log('\n🎉 Structured assessment test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    if (error.request) {
      console.error('No response received. Check if the server is running.');
    }
  }
};

// Test error cases
const testErrorCases = async () => {
  console.log('\n🧪 Testing Error Cases');
  console.log('=====================');

  const errorTests = [
    {
      name: 'Missing patient_profile',
      data: {
        structured_request: {
          primary_complaint: { main_symptom: 'test', duration: '1 day', severity: 'mild', onset: 'sudden', progression: 'stable' },
          reproductive_history: { pregnancy_status: { could_be_pregnant: false, pregnancy_test_result: 'negative' }, sexual_activity: { sexually_active: false, contraception_method: 'none' }, menstrual_history: { menarche_age: 12, cycle_frequency: 28, period_duration: 5 } },
          medical_context: { current_medications: [], recent_medications: [], medical_conditions: [], previous_gynecological_issues: [], allergies: [], family_history: [] },
          healthcare_interaction: { previous_consultation: false, consultation_outcome: 'none', investigations_done: false, current_treatment: 'none' },
          patient_concerns: { main_worry: 'test', impact_on_life: 'minimal', additional_notes: 'test' }
        }
      }
    },
    {
      name: 'Invalid age (too young)',
      data: {
        structured_request: {
          patient_profile: { age: 5, request_id: 'test', timestamp: '2025-01-28T10:30:00Z' },
          primary_complaint: { main_symptom: 'test', duration: '1 day', severity: 'mild', onset: 'sudden', progression: 'stable' },
          reproductive_history: { pregnancy_status: { could_be_pregnant: false, pregnancy_test_result: 'negative' }, sexual_activity: { sexually_active: false, contraception_method: 'none' }, menstrual_history: { menarche_age: 12, cycle_frequency: 28, period_duration: 5 } },
          medical_context: { current_medications: [], recent_medications: [], medical_conditions: [], previous_gynecological_issues: [], allergies: [], family_history: [] },
          healthcare_interaction: { previous_consultation: false, consultation_outcome: 'none', investigations_done: false, current_treatment: 'none' },
          patient_concerns: { main_worry: 'test', impact_on_life: 'minimal', additional_notes: 'test' }
        }
      }
    }
  ];

  for (const test of errorTests) {
    try {
      console.log(`\nTesting: ${test.name}`);
      await axios.post(
        `${BASE_URL}/consultations/symptoms/collect-structured`,
        test.data,
        {
          headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('❌ Expected error but request succeeded');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Correctly rejected with 400 status');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
  }
};

// Run tests
const runTests = async () => {
  await testStructuredAssessment();
  await testErrorCases();
};

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testStructuredAssessment, testErrorCases }; 