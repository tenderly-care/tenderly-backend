const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/tenderly');

// Define minimal user schema for testing
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  roles: { type: [String], default: ['patient'] },
  accountStatus: { type: String, default: 'active' },
  isEmailVerified: { type: Boolean, default: true },
  isPhoneVerified: { type: Boolean, default: true },
  isKYCDone: { type: Boolean, default: false },
  isMFAEnabled: { type: Boolean, default: false },
  failedLoginAttempts: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: Date.now },
}, { 
  timestamps: true,
  methods: {
    requiresMFA() {
      return false; // Patients don't require MFA
    },
    isAccountLocked() {
      return false;
    },
    canLogin() {
      return { canLogin: true };
    }
  }
});

const User = mongoose.model('User', userSchema);

async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    // Hash password
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    
    // Create user
    const userData = {
      _id: new mongoose.Types.ObjectId('68738db57e71f5951addafd5'),
      firstName: 'Test',
      lastName: 'User',
      email: 'asharansari@test.com',
      phone: '+1234567890',
      password: hashedPassword,
      roles: ['patient'],
      accountStatus: 'active',
      isEmailVerified: true,
      isPhoneVerified: true,
      isKYCDone: false,
      isMFAEnabled: false,
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
    };
    
    // Delete existing user if exists
    await User.deleteOne({ _id: userData._id });
    
    // Create new user
    const user = new User(userData);
    await user.save();
    
    console.log('✅ Test user created successfully');
    console.log('User ID:', user._id);
    console.log('Email:', user.email);
    console.log('Roles:', user.roles);
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    mongoose.connection.close();
  }
}

createTestUser();
