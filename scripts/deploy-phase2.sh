#!/bin/bash

# TaskFlow Pro - Phase 2 Frontend Upload Script

set -e

# Configuration
STUDENT_ID="20251806"
STACK_NAME="TaskFlow-Phase1"
REGION="us-east-1"
FRONTEND_DIR="./frontend"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "================================================"
echo "TaskFlow Pro - Phase 2 Frontend Upload"
echo "================================================"
echo ""

# Check if Phase 1 stack exists
echo "Checking Phase 1 infrastructure..."
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].StackStatus' \
    --output text --region $REGION 2>/dev/null || echo "NONE")

if [ "$STACK_STATUS" = "NONE" ]; then
    echo -e "${RED}Error: Phase 1 stack not found. Run deploy-phase1.sh first.${NC}"
    exit 1
fi

# Get bucket name and website URL
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' \
    --output text --region $REGION)

WEBSITE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text --region $REGION)

WEBSITE_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteDomainName`].OutputValue' \
    --output text --region $REGION)

# Create temporary config.js with placeholders
echo ""
echo "Creating config.js for Phase 2..."

cat > $FRONTEND_DIR/js/config.js << EOF
// TaskFlow Pro Configuration
// Phase 2 - Basic configuration (Cognito and API will be added in later phases)
const config = {
    cognito: {
        domain: '', // Will be filled after Cognito setup (Phase 3)
        clientId: '', // Will be filled after Cognito setup (Phase 3)
        redirectUri: 'https://${WEBSITE_DOMAIN}/index.html',
        region: '${REGION}'
    },
    api: {
        endpoint: '' // Will be filled after API Gateway setup (Phase 5)
    }
};

// Log configuration status
console.log('TaskFlow Pro - Phase 2 Configuration Loaded');
console.log('Website Domain:', '${WEBSITE_DOMAIN}');
EOF

echo -e "${GREEN}✓ config.js created${NC}"

# Upload frontend files to S3
echo ""
echo "Uploading frontend files to S3..."

# Upload HTML files
aws s3 cp $FRONTEND_DIR/index.html s3://$BUCKET_NAME/ --region $REGION
aws s3 cp $FRONTEND_DIR/error.html s3://$BUCKET_NAME/ --region $REGION

# Upload CSS
aws s3 cp $FRONTEND_DIR/css/style.css s3://$BUCKET_NAME/css/ --region $REGION

# Upload JavaScript files
aws s3 cp $FRONTEND_DIR/js/config.js s3://$BUCKET_NAME/js/ --region $REGION
aws s3 cp $FRONTEND_DIR/js/auth.js s3://$BUCKET_NAME/js/ --region $REGION
aws s3 cp $FRONTEND_DIR/js/app.js s3://$BUCKET_NAME/js/ --region $REGION

echo -e "${GREEN}✓ All files uploaded successfully${NC}"

# Test website
echo ""
echo "Testing website accessibility..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $WEBSITE_URL || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Website is accessible${NC}"
else
    echo -e "${YELLOW}⚠ Website returned HTTP code: $HTTP_CODE${NC}"
fi

echo ""
echo "================================================"
echo "Phase 2 Deployment Complete!"
echo "================================================"
echo ""
echo "Website Information:"
echo "  • URL: $WEBSITE_URL"
echo "  • Bucket: $BUCKET_NAME"
echo "  • Domain: $WEBSITE_DOMAIN"
echo ""
echo "Files Uploaded:"
echo "  ✓ index.html"
echo "  ✓ error.html"
echo "  ✓ css/style.css"
echo "  ✓ js/config.js (with Phase 2 placeholders)"
echo "  ✓ js/auth.js"
echo "  ✓ js/app.js"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Phase 3: Add Cognito authentication"
echo "  2. Phase 4: Add remaining services (SNS, SQS, EventBridge, etc.)"
echo "  3. Phase 5: Import API Gateway"
echo ""
