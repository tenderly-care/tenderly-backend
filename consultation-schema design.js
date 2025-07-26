// PatientProfile
interface PatientProfile {
  patientId: ObjectId;
  demographicData: { age: number; name: string; location: string; };
  allergies: string[];
  menstrualHistory: { cycleFrequency: number; menarcheAge: number; periodDuration: number };
  currentMedications: string[];
  medical_conditions: string[];
  familyMedicalHistory: string[];
//   lifestyleFactors: { ... };

  //...
}

// SymptomScreening (Temp Screening)
interface SymptomScreening {
  session_id: ObjectId;
  patientId: ObjectId;
  initialSymptoms: { 
   primary_symptoms: string[];
   patient_age: number;
   severity_level: number;
    duration: string;
    onset: string;
    progression: string;
   };
  aiScreening: { 
    session_id: ObjectId;
    patientId: ObjectId;
    initialDiagnosis: {
        diagnosis: string[];
        confidenceScore: number;
        suggested_investigations: string[];
        recommended_medications: string[];
        lifestyle_advice: string[];
        follow_up_recommendations: string[];
        disclaimer: string;
        timestamp: Date;
        severity_level: number;
    }
   };
  metadata: {
    sessionId: ObjectId;
    patientId: ObjectId;
   };
  createdAt: Date;
  expiresAt: Date;
}

// Consultation (Post-Payment, Core)
interface Consultation {
  consultationId: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  session_id: ObjectId;
  detailedSymptoms: { 
    primary_complaint: {
        main_symptom: string;
        duration: string;
        severity: string;
        onset: string;
        progression: string;
    },
    symptom_specific_details: {
        symptom_characteristics: {
            cycle_length: string;
            bleeding_duration: string;
            bleeding_intensity: string;
            bleeding_between_periods: boolean;
            skipped_periods: string;
            associated_symptoms: string[];
            recent_weight_changes: boolean;
            known_causes: string;
        }
    },
    reproductive_history: {
        pregnancy_status: {
            could_be_pregnant: boolean;
            pregnancy_test_result: string;
        },
        sexual_activity: {
            sexually_active: boolean;
            contraception_method: string;
        },
        menstrual_history: {
            menarche_age: number;
            cycle_frequency: number;
            period_duration: number;
        }
    },
    associated_symptoms: {
        pain: {
            pelvic_pain: string;
            vulvar_irritation: string;
        },
        systemic: {
            fatigue: string;
            nausea: boolean;
            fever: boolean;
        }
    },
    medical_context: {
        current_medications: string[];
        recent_medications: string[];
        medical_conditions: string[];
        previous_gynecological_issues: string[];
        allergies: string[];
        family_history: string[];
    },
    healthcare_interaction: {
        previous_consultation: boolean;
        consultation_outcome: string;
        investigations_done: boolean;
        current_treatment: string;
    },
    patient_concerns: {
        main_worry: string;
        impact_on_life: string;
        additional_notes: string;
    }
   };
  aiDiagnosis: { 
    possible_diagnoses: string[];
    clinical_reasoning: string;
    recommended_investigations: string[];
    treatment_recommendations: {
        primary_treatment: string;
        safe_medications: string[];
        lifestyle_modifications: string[];
        dietary_advice: string[];
        follow_up_timeline: string;
    };
    patient_education: string[];
    warning_signs: string[];
    confidence_score: number;
    processing_notes: string;
    disclaimer: string;
    timestamp: Date;
    };

  prescriptionIds: ObjectId[];
  prescriptionPdfUrl: string;
  chatHistory: Array<{ 
    senderId: ObjectId;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
   }>;
  paymentInfo: { 
    paymentId: ObjectId;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: 'pending' | 'completed' | 'failed';
    transactionId?: string;
    paymentDate: Date;
   };

  consultationType: ConsultationType;
  status: ConsultationStatus;
  statusHistory: Array<{ 
    status: ConsultationStatus;
    changedAt: Date;
    changedBy: ObjectId; // User ID of the person who changed the status
    reason?: string; // Optional reason for status change
   }>;
  consultationStartTime: Date;
  consultationEndTime: Date;
  metadata: { 
    sessionId: ObjectId;
    patientId: ObjectId;
    doctorId: ObjectId;
   };
  createdAt: Date;
  updatedAt: Date;
}

// Prescription
interface Prescription {
  prescriptionId: ObjectId;
  consultationId: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  pdfDownloadUrl: string;
  issuedAt: Date;
  digitalSignature: string;
}



//changes

// PatientProfile
interface PatientProfile {
  patientId: ObjectId;
  demographicData: { age: number; name: string; location: string; };
  allergies: string[];
  menstrualHistory: { cycleFrequency: number; menarcheAge: number; periodDuration: number };
  currentMedications: string[];
  medical_conditions: string[];
  familyMedicalHistory: string[];
//   lifestyleFactors: { ... };

  //...
}

// SymptomScreening (Temp Screening)
interface SymptomScreening {
  session_id: ObjectId;
  patientId: ObjectId;
  initialSymptoms: { 
   primary_symptoms: string[];
   patient_age: number;
   severity_level: number;
    duration: string;
    onset: string;
    progression: string;
   };
  aiScreening: { 
    session_id: ObjectId;
    patientId: ObjectId;
    initialDiagnosis: {
        diagnosis: string[];
        confidenceScore: number;
        suggested_investigations: string[];
        recommended_medications: string[];
        lifestyle_advice: string[];
        follow_up_recommendations: string[];
        disclaimer: string;
        timestamp: Date;
        severity_level: number;
    }
   };
  metadata: {
    sessionId: ObjectId;
    patientId: ObjectId;
   };
  createdAt: Date;
  expiresAt: Date;
}

// Consultation (Post-Payment, Core)
interface Consultation {
  consultationId: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  session_id: ObjectId;
  detailedSymptoms: { 
    primary_complaint: {
        main_symptom: string;
        duration: string;
        severity: string;
        onset: string;
        progression: string;
    },
    symptom_specific_details: {
        symptom_characteristics: Record<string, any>;
        filled_by: ObjectId;
        filled_at: Date;
        schema_version?: string;
    },
    reproductive_history: {
        pregnancy_status: {
            could_be_pregnant: boolean;
            pregnancy_test_result: string;
        },
        sexual_activity: {
            sexually_active: boolean;
            contraception_method: string;
        },
        menstrual_history: {
            menarche_age: number;
            cycle_frequency: number;
            period_duration: number;
        }
    },
    associated_symptoms: {
        pain: {
            pelvic_pain: string;
            vulvar_irritation: string;
        },
        systemic: {
            fatigue: string;
            nausea: boolean;
            fever: boolean;
        }
    },
    medical_context: {
        current_medications: string[];
        recent_medications: string[];
        medical_conditions: string[];
        previous_gynecological_issues: string[];
        allergies: string[];
        family_history: string[];
    },
    healthcare_interaction: {
        previous_consultation: boolean;
        consultation_outcome: string;
        investigations_done: boolean;
        current_treatment: string;
    },
    patient_concerns: {
        main_worry: string;
        impact_on_life: string;
        additional_notes: string;
    }
   };
  aiDiagnosis: { 
    possible_diagnoses: string[];
    clinical_reasoning: string;
    recommended_investigations: string[];
    treatment_recommendations: {
        primary_treatment: string;
        safe_medications: string[];
        lifestyle_modifications: string[];
        dietary_advice: string[];
        follow_up_timeline: string;
    };
    patient_education: string[];
    warning_signs: string[];
    confidence_score: number;
    processing_notes: string;
    disclaimer: string;
    timestamp: Date;
    };

  prescriptionIds: ObjectId[];
  prescriptionPdfUrl: string;
  chatHistory: Array<{ 
    senderId: ObjectId;
    senderType: 'patient' | 'doctor';
    message: string;
    timestamp: Date;
    messageType: 'text' | 'image' | 'file';
    attachments?: string[];
   }>;
  paymentInfo: { 
    paymentId: ObjectId;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: 'pending' | 'completed' | 'failed';
    transactionId?: string;
    paymentDate: Date;
   };

  consultationType: ConsultationType;
  status: ConsultationStatus;
  statusHistory: Array<{ 
    status: ConsultationStatus;
    changedAt: Date;
    changedBy: ObjectId; // User ID of the person who changed the status
    reason?: string; // Optional reason for status change
   }>;
  consultationStartTime: Date;
  consultationEndTime: Date;
  metadata: { 
    sessionId: ObjectId;
    patientId: ObjectId;
    doctorId: ObjectId;
   };
  createdAt: Date;
  updatedAt: Date;
}

// Prescription
interface Prescription {
  prescriptionId: ObjectId;
  consultationId: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  pdfDownloadUrl: string;
  issuedAt: Date;
  digitalSignature: string;
}

