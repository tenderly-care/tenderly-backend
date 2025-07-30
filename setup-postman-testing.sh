#!/bin/bash

# 🚀 Doctor Profile API - Postman Testing Setup Script
# This script helps you set up everything needed to test the API

echo "============================================================"
echo "🏥 DOCTOR PROFILE MANAGEMENT API - POSTMAN SETUP"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 STEP 1: Checking Prerequisites${NC}"

# Check if Node.js is installed
if command -v node &> /dev/null; then
    echo -e "${GREEN}✅ Node.js is installed: $(node -v)${NC}"
else
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 16+${NC}"
    exit 1
fi

# Check if npm is available
if command -v npm &> /dev/null; then
    echo -e "${GREEN}✅ npm is available: $(npm -v)${NC}"
else
    echo -e "${RED}❌ npm is not available${NC}"
    exit 1
fi

# Check if MongoDB is running (optional check)
echo -e "${YELLOW}⚠️  Make sure MongoDB is running on your system${NC}"

echo -e "\n${BLUE}📋 STEP 2: Building the Project${NC}"

# Build the project
echo "Building TypeScript project..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Project built successfully${NC}"
else
    echo -e "${RED}❌ Build failed. Please fix compilation errors first${NC}"
    exit 1
fi

echo -e "\n${BLUE}📋 STEP 3: Files Created for Testing${NC}"

# Check if required files exist
files=(
    "DOCTOR_PROFILE_MANAGEMENT.md"
    "POSTMAN_TESTING_GUIDE.md" 
    "Doctor_Profile_API.postman_collection.json"
    "test-doctor-profile.js"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file (missing)${NC}"
    fi
done

echo -e "\n${BLUE}📋 STEP 4: Postman Setup Instructions${NC}"

echo -e "${YELLOW}🔧 POSTMAN SETUP STEPS:${NC}"
echo "1. Open Postman"
echo "2. Click 'Import' button"
echo "3. Select 'Doctor_Profile_API.postman_collection.json'"
echo "4. Create a new Environment with these variables:"
echo "   - base_url: http://localhost:3001/api/v1"
echo "   - doctor_token: (leave empty - will be set after login)"
echo "   - admin_token: (leave empty - will be set after admin login)"
echo "   - doctor_id: (leave empty - will be set after doctor login)"

echo -e "\n${BLUE}📋 STEP 5: Testing Workflow${NC}"

echo -e "${YELLOW}🎯 TESTING SEQUENCE:${NC}"
echo "1. Start your backend server:"
echo "   npm run start:dev"
echo ""
echo "2. In Postman, run these requests in order:"
echo "   a) Authentication → Login Doctor"
echo "   b) Authentication → Login Admin"
echo "   c) Doctor Profile Management → Get Doctor Profile"
echo "   d) Doctor Profile Management → Update Professional Info"
echo "   e) Doctor Profile Management → Update Availability"
echo "   f) Doctor Profile Management → Get Profile Completion Status"
echo "   g) Admin Operations → Update Medical License"
echo "   h) Admin Operations → Validate License"
echo "   i) Error Testing → Run all error test cases"

echo -e "\n${BLUE}📋 STEP 6: Sample Test Data${NC}"

echo -e "${YELLOW}📝 You'll need to update these in the login requests:${NC}"
echo "Doctor Login Credentials:"
echo "  email: doctor@example.com"
echo "  password: your-actual-doctor-password"
echo ""
echo "Admin Login Credentials:"
echo "  email: admin@example.com"
echo "  password: your-actual-admin-password"

echo -e "\n${BLUE}📋 STEP 7: Starting Development Server${NC}"

echo -e "${YELLOW}🚀 Starting the development server...${NC}"
echo "The server will run on http://localhost:3001"
echo ""
echo "Once the server is running, you can:"
echo "• Test with Postman using the imported collection"
echo "• View API documentation at http://localhost:3001/api/docs"
echo "• Run the test script: node test-doctor-profile.js"

echo -e "\n${GREEN}🎉 SETUP COMPLETE!${NC}"
echo -e "${GREEN}You're ready to test the Doctor Profile Management API${NC}"
echo ""
echo -e "${BLUE}📖 For detailed testing instructions, see:${NC}"
echo "• POSTMAN_TESTING_GUIDE.md - Complete testing guide"
echo "• DOCTOR_PROFILE_MANAGEMENT.md - System documentation"

echo -e "\n${YELLOW}💡 QUICK START:${NC}"
echo "1. Run: npm run start:dev"
echo "2. Open Postman and import the collection"
echo "3. Set up environment variables"
echo "4. Start testing with Authentication requests"

echo "============================================================"

# Ask if user wants to start the dev server
echo -e "\n${BLUE}Start the development server now? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 Starting development server...${NC}"
    npm run start:dev
else
    echo -e "${YELLOW}👍 You can start the server later with: npm run start:dev${NC}"
fi
