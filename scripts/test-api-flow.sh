#!/bin/bash

# Script to test the complete verification flow using curl
# This demonstrates the manual verification flow using the Oracle API

echo "===== BLOCKCHAIN IDENTITY SYSTEM - VERIFICATION FLOW TEST ====="
echo ""

# 0. Configuration
ORACLE_API="http://localhost:3030"
TEST_USER="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

# Function to check if the API is accessible
check_api_health() {
  echo "Checking if Oracle API is available at ${ORACLE_API}..."
  HEALTH_CHECK=$(curl -s -m 5 "${ORACLE_API}/health" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$HEALTH_CHECK" ]; then
    echo "❌ ERROR: Oracle API is not accessible at ${ORACLE_API}"
    echo "Please make sure the Oracle service is running."
    exit 1
  else
    echo "✅ Oracle API is available!"
    echo ""
    echo "API Health Status:"
    echo "$HEALTH_CHECK" | jq
  fi
}

# 1. Check health of Oracle service
echo "1. Checking Oracle API health..."
check_api_health

echo ""
read -p "Press Enter to continue..."
echo ""

# 2. Create an identity if needed
echo "2. Checking if user already has identity..."
IDENTITY_CHECK=$(curl -s "${ORACLE_API}/api/identity/details?address=${TEST_USER}")
HAS_IDENTITY=$(echo $IDENTITY_CHECK | jq -r '.success')

if [ "$HAS_IDENTITY" == "true" ]; then
  echo "✅ User already has identity:"
  echo $IDENTITY_CHECK | jq
  TOKEN_ID=$(echo $IDENTITY_CHECK | jq -r '.data.tokenId')
  echo "Using Token ID: ${TOKEN_ID}"
else
  echo "Creating new identity for user..."
  IDENTITY_RESULT=$(curl -s -X POST "${ORACLE_API}/api/identity/create" \
    -H "Content-Type: application/json" \
    -d '{
      "address": "'"${TEST_USER}"'",
      "did": "did:ethr:'"${TEST_USER}"'",
      "metadata": {
        "name": "Test User",
        "email": "user@example.com",
        "createdAt": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"
      }
    }')
  
  echo "$IDENTITY_RESULT" | jq
  
  # Get token ID after identity creation
  echo "Waiting for identity creation to be processed..."
  sleep 5
  IDENTITY_CHECK=$(curl -s "${ORACLE_API}/api/identity/details?address=${TEST_USER}")
  TOKEN_ID=$(echo $IDENTITY_CHECK | jq -r '.data.tokenId')
  
  if [ -z "$TOKEN_ID" ] || [ "$TOKEN_ID" == "null" ]; then
    echo "❌ ERROR: Could not retrieve token ID after identity creation."
    echo "Trying again after a longer delay..."
    sleep 10
    IDENTITY_CHECK=$(curl -s "${ORACLE_API}/api/identity/details?address=${TEST_USER}")
    TOKEN_ID=$(echo $IDENTITY_CHECK | jq -r '.data.tokenId')
    
    if [ -z "$TOKEN_ID" ] || [ "$TOKEN_ID" == "null" ]; then
      echo "❌ ERROR: Still could not retrieve token ID. Using default value of 1."
      TOKEN_ID=1
    else
      echo "✅ Retrieved token ID after second attempt: ${TOKEN_ID}"
    fi
  else
    echo "✅ New identity created with token ID: ${TOKEN_ID}"
  fi
fi

echo ""
read -p "Press Enter to continue..."
echo ""

# 3. Check initial verification level
echo "3. Checking initial verification level..."
INITIAL_LEVEL=$(curl -s "${ORACLE_API}/api/identity/verificationLevel?address=${TEST_USER}")
echo "$INITIAL_LEVEL" | jq
LEVEL_NAME=$(echo "$INITIAL_LEVEL" | jq -r '.data.levelName')
echo "Initial verification level: ${LEVEL_NAME}"

echo ""
read -p "Press Enter to continue..."
echo ""

# 4. Request verification
echo "4. Requesting KYC verification..."
VERIFICATION_RESULT=$(curl -s -X POST "${ORACLE_API}/api/verifications/mock" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "'"${TEST_USER}"'",
    "verificationType": 0,
    "metadata": {
      "fullName": "Test User",
      "dateOfBirth": "1990-01-01",
      "documentType": "passport",
      "documentId": "AB123456",
      "nationality": "USA",
      "verificationRequest": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"
    }
  }')

echo "$VERIFICATION_RESULT" | jq

# Check if the verification was submitted successfully
VERIFICATION_SUCCESS=$(echo "$VERIFICATION_RESULT" | jq -r '.success')

if [ "$VERIFICATION_SUCCESS" == "true" ]; then
  echo "✅ KYC verification request processed successfully!"
  
  # Get verification level from the response
  VERIFICATION_LEVEL=$(echo "$VERIFICATION_RESULT" | jq -r '.data.level')
  VERIFICATION_LEVEL_NAME=$(echo "$VERIFICATION_RESULT" | jq -r '.data.levelName')
  
  if [ ! -z "$VERIFICATION_LEVEL" ] && [ "$VERIFICATION_LEVEL" != "null" ]; then
    echo "Current verification level is now: ${VERIFICATION_LEVEL_NAME} (${VERIFICATION_LEVEL})"
  fi
  
  # Get token ID from the response if available
  RESPONSE_TOKEN_ID=$(echo "$VERIFICATION_RESULT" | jq -r '.data.tokenId')
  if [ ! -z "$RESPONSE_TOKEN_ID" ] && [ "$RESPONSE_TOKEN_ID" != "null" ]; then
    echo "Token ID confirmed as: ${RESPONSE_TOKEN_ID}"
    # Update the token ID variable if we got a new one
    TOKEN_ID=$RESPONSE_TOKEN_ID
  fi
else
  echo "❌ ERROR: Verification request failed."
  echo "Error message: $(echo "$VERIFICATION_RESULT" | jq -r '.error')"
  echo "Continuing to check verification status anyway..."
fi

echo ""
read -p "Press Enter to continue..."
echo ""

# 5. Check pending verifications (should be empty since we process immediately now)
echo "5. Checking if there are any pending verifications..."
PENDING_RESULT=$(curl -s "${ORACLE_API}/api/verifications/pending")
echo "$PENDING_RESULT" | jq

# Check if there are any pending verifications
PENDING_COUNT=$(echo "$PENDING_RESULT" | jq -r '.data.pendingCount')
if [ "$PENDING_COUNT" == "0" ]; then
  echo "✅ No pending verifications found. This is expected since our new implementation processes verifications immediately."
else
  echo "ℹ️ Found ${PENDING_COUNT} pending verifications."
fi

echo ""
read -p "Press Enter to continue..."
echo ""

# 6. Check verification level (should be BASIC_VERIFIED after our changes)
echo "6. Checking verification level after first verifier approval..."
FIRST_LEVEL=$(curl -s "${ORACLE_API}/api/identity/verificationLevel?address=${TEST_USER}")
echo "$FIRST_LEVEL" | jq

FIRST_LEVEL_NAME=$(echo "$FIRST_LEVEL" | jq -r '.data.levelName')
FIRST_LEVEL_VALUE=$(echo "$FIRST_LEVEL" | jq -r '.data.level')
echo "Current verification level: ${FIRST_LEVEL_NAME} (${FIRST_LEVEL_VALUE})"

if [ "$FIRST_LEVEL_NAME" == "$LEVEL_NAME" ]; then
  echo "⚠️ Warning: Verification level did not change to BASIC_VERIFIED."
  echo "This could indicate an issue with the verification process."
  echo "We'll continue with the second approval anyway..."
elif [ "$FIRST_LEVEL_NAME" == "BASIC VERIFIED" ]; then
  echo "✅ Success! Verification level is now BASIC_VERIFIED as expected."
  echo "Ready to proceed with the second verifier approval."
else
  echo "⚠️ Unexpected verification level: ${FIRST_LEVEL_NAME}"
  echo "Continuing with second verification anyway..."
fi

echo ""
read -p "Press Enter to continue..."
echo ""

# 7. Add second verifier approval to reach KYC_VERIFIED level
echo "7. Adding second verifier approval..."

# Give the system a moment to process the previous verification
echo "Waiting 3 seconds before attempting second verifier approval..."
sleep 3

# Make the request with a longer timeout (30 seconds)
SECOND_APPROVAL=$(curl -s -m 30 -X POST "${ORACLE_API}/api/verifications/second-approval" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "'"${TOKEN_ID}"'",
    "targetLevel": 2
  }')

# Check if curl returned valid JSON
if ! echo "$SECOND_APPROVAL" | jq . >/dev/null 2>&1; then
  echo "❌ ERROR: Received invalid JSON response from server"
  echo "Raw response: $SECOND_APPROVAL"
  echo "This could be due to a server error or timeout."
else
  echo "$SECOND_APPROVAL" | jq .
  
  # Check if the second approval was successful
  SECOND_APPROVAL_SUCCESS=$(echo "$SECOND_APPROVAL" | jq -r '.success // false')
  SECOND_APPROVAL_MSG=$(echo "$SECOND_APPROVAL" | jq -r '.message // "No message"')
  
  if [ "$SECOND_APPROVAL_SUCCESS" == "true" ]; then
    SECOND_LEVEL_NAME=$(echo "$SECOND_APPROVAL" | jq -r '.verificationLevelName // "unknown"')
    SECOND_LEVEL_VALUE=$(echo "$SECOND_APPROVAL" | jq -r '.verificationLevel // "unknown"')
    
    echo "✅ Second verifier approval was successful."
    echo "Message: $SECOND_APPROVAL_MSG"
    
    if [ ! -z "$SECOND_LEVEL_NAME" ] && [ "$SECOND_LEVEL_NAME" != "null" ] && [ "$SECOND_LEVEL_NAME" != "unknown" ]; then
      echo "Verification level after second approval: ${SECOND_LEVEL_NAME} (${SECOND_LEVEL_VALUE})"
      
      if [ "$SECOND_LEVEL_NAME" == "KYC VERIFIED" ] || [ "$SECOND_LEVEL_VALUE" == "2" ]; then
        echo "✅ Successfully upgraded to KYC_VERIFIED level!"
      else
        echo "⚠️ Verification level is not KYC_VERIFIED after second approval."
        echo "This could be because the contract requires more verifiers or there was an issue."
      fi
    fi
    
    # Display verification counts if available
    BEFORE_COUNT=$(echo "$SECOND_APPROVAL" | jq -r '.beforeVerificationCount // "unknown"')
    AFTER_COUNT=$(echo "$SECOND_APPROVAL" | jq -r '.afterVerificationCount // "unknown"')
    
    if [ "$BEFORE_COUNT" != "unknown" ] && [ "$AFTER_COUNT" != "unknown" ]; then
      echo "Verification count before: $BEFORE_COUNT, after: $AFTER_COUNT"
      
      if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
        echo "✅ Verification count increased, verifier approval was recorded"
      else 
        echo "⚠️ Verification count did not increase, this verifier may have already approved"
      fi
    fi
    
    # Display transaction hash if available
    TX_HASH=$(echo "$SECOND_APPROVAL" | jq -r '.transactionHash // "unknown"')
    if [ "$TX_HASH" != "unknown" ]; then
      echo "Transaction hash: $TX_HASH"
    fi
  else
    echo "❌ ERROR: Second verifier approval failed."
    echo "Error message: $(echo "$SECOND_APPROVAL" | jq -r '.error // "Unknown error"')"
    echo "This could be due to:"
    echo "- The verification level was not at BASIC_VERIFIED"
    echo "- The token ID is incorrect (${TOKEN_ID})"
    echo "- Issues with the verifier role assignment"
    echo "- BigInt serialization issues in the response"
  fi
fi

echo ""
read -p "Press Enter to continue..."
echo ""

# 8. Check final verification level (should be KYC_VERIFIED)
echo "8. Checking final verification level..."

# Give the system a moment to process the second verification
echo "Waiting 3 seconds before final check..."
sleep 3

FINAL_LEVEL=$(curl -s "${ORACLE_API}/api/identity/verificationLevel?address=${TEST_USER}")

# Check if we got a valid response
if ! echo "$FINAL_LEVEL" | jq . >/dev/null 2>&1; then
  echo "❌ ERROR: Received invalid JSON response from server for final verification check"
  echo "Raw response: $FINAL_LEVEL"
else
  echo "$FINAL_LEVEL" | jq .
  
  FINAL_SUCCESS=$(echo "$FINAL_LEVEL" | jq -r '.success // false')
  
  if [ "$FINAL_SUCCESS" == "true" ]; then
    # Try to get the verification level using different possible field names
    FINAL_LEVEL_NAME=$(echo "$FINAL_LEVEL" | jq -r '.data.verificationLevelName // .data.levelName // "unknown"')
    FINAL_LEVEL_VALUE=$(echo "$FINAL_LEVEL" | jq -r '.data.verificationLevel // .data.level // "unknown"')
    echo "Final verification level: ${FINAL_LEVEL_NAME} (${FINAL_LEVEL_VALUE})"
    
    if [ "$FINAL_LEVEL_NAME" == "KYC VERIFIED" ] || [ "$FINAL_LEVEL_VALUE" == "2" ]; then
      echo "✅ SUCCESS: Verification flow completed successfully!"
      echo "Identity is now KYC VERIFIED."
      
      echo ""
      echo "📋 VERIFICATION FLOW SUMMARY 📋"
      echo "----------------------------------------------------------------"
      echo "Initial verification level: ${LEVEL_NAME}"
      echo "First verifier approval: BASIC VERIFIED (level 1)"
      echo "Second verifier approval: KYC VERIFIED (level 2)"
      echo "Final verification level: ${FINAL_LEVEL_NAME} (level ${FINAL_LEVEL_VALUE})"
      echo "----------------------------------------------------------------"
    else
      echo "⚠️ Verification flow did not result in KYC VERIFIED status."
      echo "Current level is: ${FINAL_LEVEL_NAME} (${FINAL_LEVEL_VALUE})"
      echo "This could be due to:"
      echo "- Not enough different verifiers approving the identity"
      echo "- Issues with the verification contracts"
      echo "- Role assignment problems"
      echo "Please check the logs for more details on what went wrong."
    fi
  else
    echo "❌ ERROR: Failed to get final verification level"
    echo "Error message: $(echo "$FINAL_LEVEL" | jq -r '.error // "Unknown error"')"
  fi
fi

echo ""
echo "===== VERIFICATION FLOW TEST COMPLETED ====="
