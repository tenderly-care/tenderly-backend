const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_PATIENT_ID = '6884d6abc1ceb202ca8066c4';

async function testSimpleConsultation() {
  console.log('🧪 Testing Simple Consultation Creation');
  console.log('=====================================\n');

  try {
    // Step 1: Health check
    console.log('1️⃣ Checking API health...');
    const healthResponse = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ API is healthy:', healthResponse.data.message);
    console.log('');

    // Step 2: Test simple consultation creation
    console.log('2️⃣ Testing simple consultation creation...');
    const simpleConsultationData = {
      patientId: TEST_PATIENT_ID,
      doctorId: '687656c3e69fa2e8923dbc2c',
      sessionId: 'test_session_simple',
      consultationType: 'chat',
      detailedSymptoms: {
        patient_profile: {
          age: 25,
          request_id: TEST_PATIENT_ID,
          timestamp: new Date().toISOString()
        },
        primary_complaint: {
          main_symptom: "General consultation",
          duration: "2 days",
          severity: "mild",
          onset: "gradual",
          progression: "stable"
        },
        symptom_specific_details: {
          symptom_characteristics: {},
          filled_by: 'patient',
          filled_at: new Date(),
          schema_version: '1.0'
        },
        reproductive_history: {
          pregnancy_status: {
            could_be_pregnant: false,
            pregnancy_test_result: "negative"
          },
          sexual_activity: {
            sexually_active: false,
            contraception_method: "none"
          },
          menstrual_history: {
            menarche_age: 13,
            cycle_frequency: 28,
            period_duration: 5
          }
        },
        associated_symptoms: {
          systemic: {
            fever: false,
            fatigue: false
          },
          pain: {
            pelvic_pain: false,
            back_pain: false
          }
        },
        medical_context: {
          current_medications: [],
          recent_medications: [],
          medical_conditions: [],
          previous_gynecological_issues: [],
          allergies: [],
          family_history: []
        },
        healthcare_interaction: {
          recent_consultations: [],
          previous_treatments: [],
          diagnostic_tests: [],
          surgical_history: []
        },
        patient_concerns: {
          main_worry: "General health concern",
          impact_on_life: "minimal",
          additional_notes: "Routine checkup"
        }
      },
      aiDiagnosis: {
        possible_diagnoses: ["General consultation"],
        confidence_score: 0.7,
        clinical_reasoning: "Routine health assessment",
        timestamp: new Date().toISOString()
      }
    };

    const createResponse = await axios.post(
      `${BASE_URL}/consultations`,
      simpleConsultationData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Simple consultation created successfully!');
    console.log('📋 Consultation ID:', createResponse.data.consultationId);
    console.log('👤 Patient ID:', createResponse.data.patientId);
    console.log('👨‍⚕️ Doctor ID:', createResponse.data.doctorId);
    console.log('📊 Status:', createResponse.data.status);
    console.log('');

    // Step 3: Test the detailed symptoms endpoint with minimal data
    console.log('3️⃣ Testing detailed symptoms with minimal data...');
    const minimalSymptomsData = {
      patient_profile: {
        age: 25,
        request_id: TEST_PATIENT_ID,
        timestamp: new Date().toISOString()
      },
      primary_complaint: {
        main_symptom: "vaginal_discharge",
        duration: "1 week",
        severity: "moderate",
        onset: "sudden",
        progression: "stable"
      },
      symptom_specific_details: {
        symptom_characteristics: {
          discharge_characteristics: {
            color: "white",
            consistency: "cottage_cheese",
            odor: "none",
            associated_itching: "severe"
          }
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
          pelvic_pain: "mild",
          vulvar_irritation: "severe"
        },
        systemic: {
          fatigue: "none",
          fever: false
        }
      },
      medical_context: {
        current_medications: [],
        recent_medications: [],
        medical_conditions: [],
        allergies: ["Ibuprofen", "advil"],
        family_history: []
      },
      healthcare_interaction: {
        recent_consultations: [],
        previous_treatments: [],
        diagnostic_tests: [],
        surgical_history: []
      },
      patient_concerns: {
        main_worry: "recurrent infections",
        impact_on_life: "moderate",
        additional_notes: "I have many drug allergies and need safe alternatives"
      }
    };

    try {
      const symptomsResponse = await axios.post(
        `${BASE_URL}/consultations/symptoms/collect_detailed_symptoms`,
        minimalSymptomsData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
          }
        }
      );

      console.log('✅ Detailed symptoms collected successfully!');
      console.log('📋 Consultation ID:', symptomsResponse.data.consultationId);
      console.log('📊 Status:', symptomsResponse.data.consultationStatus);
      console.log('');

    } catch (symptomsError) {
      console.log('❌ Detailed symptoms collection failed:');
      console.log('   - Status:', symptomsError.response?.status);
      console.log('   - Message:', symptomsError.response?.data?.message);
      console.log('   - Error:', symptomsError.response?.data?.error);
      console.log('');
    }

    console.log('🎉 Simple consultation test completed!');

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
  testSimpleConsultation();
}

module.exports = { testSimpleConsultation }; 