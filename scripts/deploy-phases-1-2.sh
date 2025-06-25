#!/bin/bash

# TaskFlow Pro - Deploy All Phases

set -e

echo "================================================"
echo "TaskFlow Pro - Complete Deployment"
echo "================================================"
echo ""

# Run Phase 1
echo "Starting Phase 1: Infrastructure..."
./scripts/deploy-phase1.sh

# Wait for resources to be ready
echo ""
echo "Waiting for resources to be ready..."
sleep 10

# Run Phase 2
echo ""
echo "Starting Phase 2: Frontend Upload..."
./scripts/deploy-phase2.sh

echo ""
echo "================================================"
echo "Phase 1 & 2 Complete!"
echo "================================================"
echo ""
echo "Current Status:"
echo "  ✓ Phase 1: Basic Infrastructure (S3, DynamoDB, Lambda)"
echo "  ✓ Phase 2: Frontend files uploaded"
echo "  ⏳ Phase 3: Cognito authentication (manual setup required)"
echo "  ⏳ Phase 4: Additional services (SNS, SQS, etc.)"
echo "  ⏳ Phase 5: API Gateway import"
echo ""
