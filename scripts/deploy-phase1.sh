#!/bin/bash

# TaskFlow Pro - Phase 1 Deployment Script
# Creates S3, DynamoDB, and Lambda functions

set -e

# Configuration
STUDENT_ID=$(date +"%Y%d%m")
echo $STUDENT_ID
STACK_NAME="TaskFlow-Phase1"
REGION="us-east-1"
TEMPLATE_PATH="./cloudformation/01-phase1-infrastructure.yaml"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "================================================"
echo "TaskFlow Pro - Phase 1 Infrastructure Deployment"
echo "================================================"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Deploy CloudFormation stack
echo "Deploying Phase 1 infrastructure..."
aws cloudformation deploy \
    --template-file $TEMPLATE_PATH \
    --stack-name $STACK_NAME \
    --parameter-overrides \
        StudentId=$STUDENT_ID \
    --capabilities CAPABILITY_IAM \
    --region $REGION

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ CloudFormation stack deployed successfully${NC}"
else
    echo -e "${RED}✗ CloudFormation deployment failed${NC}"
    exit 1
fi

# Get stack outputs
echo ""
echo "Retrieving stack outputs..."
WEBSITE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text --region $REGION)

BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' \
    --output text --region $REGION)

WEBSITE_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteDomainName`].OutputValue' \
    --output text --region $REGION)

echo -e "${GREEN}✓ Stack outputs retrieved${NC}"

# Update Lambda functions with actual code
echo ""
echo "Updating Lambda functions with actual code..."
./scripts/update-lambda-code.sh

echo ""
echo "================================================"
echo "Phase 1 Deployment Complete!"
echo "================================================"
echo ""
echo "Resources Created:"
echo "  • S3 Website Bucket: $BUCKET_NAME"
echo "  • Website URL: $WEBSITE_URL"
echo "  • Website Domain: $WEBSITE_DOMAIN"
echo "  • DynamoDB Tables: TaskFlow-Tasks, TaskFlow-Analytics"
echo "  • Lambda Functions: 5 functions deployed"
echo ""
echo -e "${YELLOW}Next Step: Run deploy-phase2.sh to upload frontend files${NC}"
