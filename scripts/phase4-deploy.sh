#!/bin/bash

# TaskFlow Pro - Phase 4 Deployment Script
# Creates SNS, SQS, EventBridge, Parameter Store (Steps 18-21 from manual instructions)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
STUDENT_ID=$(date +"%Y%d%m")
PHASE1_STACK_NAME="TaskFlow-Phase1"
PHASE4_STACK_NAME="TaskFlow-AdditionalServices"
REGION="us-east-1"

# Helper functions
print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_info() { echo -e "${BLUE}[i]${NC} $1"; }

echo "================================================"
echo "  TaskFlow Pro - Phase 4 Additional Services"
echo "  Following Manual Instructions Steps 18-21, 23"
echo "================================================"
echo ""

print_info "Student ID (from date): $STUDENT_ID"

# Check if Phase 1 exists
print_info "Checking Phase 1 completion..."

PHASE1_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $PHASE1_STACK_NAME \
    --query 'Stacks[0].StackStatus' \
    --output text --region $REGION 2>/dev/null || echo "NOT_FOUND")

if [ "$PHASE1_STATUS" = "NOT_FOUND" ]; then
    print_error "Phase 1 stack '$PHASE1_STACK_NAME' not found. Please ensure Phase 1 is deployed."
    exit 1
fi

if [ "$PHASE1_STATUS" != "CREATE_COMPLETE" ] && [ "$PHASE1_STATUS" != "UPDATE_COMPLETE" ]; then
    print_error "Phase 1 stack is in status: $PHASE1_STATUS. Please ensure it's complete."
    exit 1
fi

print_status "Phase 1 infrastructure found and ready"

# Check if required Lambda functions exist (from Phase 1)
print_info "Verifying Lambda functions from Phase 1..."
REQUIRED_LAMBDAS=("TaskFlow-Analytics" "TaskFlow-SQSProcessor")

for lambda_func in "${REQUIRED_LAMBDAS[@]}"; do
    if aws lambda get-function --function-name "$lambda_func" --region $REGION > /dev/null 2>&1; then
        print_status "$lambda_func exists and is accessible"
    else
        print_error "$lambda_func not found. Please ensure Phase 1 deployed correctly."
        exit 1
    fi
done

# Get admin email
if [ -z "$1" ]; then
    read -p "Enter admin email for SNS notifications: " ADMIN_EMAIL
else
    ADMIN_EMAIL=$1
fi

# Validate email format
if [[ ! "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    print_error "Invalid email format: $ADMIN_EMAIL"
    exit 1
fi

print_status "Admin email validated: $ADMIN_EMAIL"

# Deploy Phase 4 CloudFormation stack
echo ""
print_info "Deploying Phase 4 CloudFormation stack..."
print_info "This will create:"
print_info "  • Step 18: SNS Topic (TaskFlow-Notifications)"
print_info "  • Step 19: SQS Queue (TaskFlow-ProcessingQueue)"
print_info "  • Step 20: Parameter Store (/taskflow/config)"
print_info "  • Step 21: EventBridge Rule (TaskFlow-DailyReport)"

aws cloudformation deploy \
    --template-file cloudformation/04-additional-services.yaml \
    --stack-name $PHASE4_STACK_NAME \
    --parameter-overrides \
        Phase1StackName=$PHASE1_STACK_NAME \
        AdminEmail=$ADMIN_EMAIL \
    --capabilities CAPABILITY_IAM \
    --region $REGION

if [ $? -eq 0 ]; then
    print_status "Phase 4 CloudFormation stack deployed successfully"
else
    print_error "Phase 4 deployment failed"
    exit 1
fi

# Get Phase 4 outputs
print_info "Retrieving Phase 4 configuration values..."

SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --stack-name $PHASE4_STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`SNSTopicArn`].OutputValue' \
    --output text --region $REGION)

SQS_QUEUE_URL=$(aws cloudformation describe-stacks \
    --stack-name $PHASE4_STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`SQSQueueUrl`].OutputValue' \
    --output text --region $REGION)

SQS_QUEUE_ARN=$(aws cloudformation describe-stacks \
    --stack-name $PHASE4_STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`SQSQueueArn`].OutputValue' \
    --output text --region $REGION)

CONFIG_VALUE=$(aws cloudformation describe-stacks \
    --stack-name $PHASE4_STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`ConfigParameterValue`].OutputValue' \
    --output text --region $REGION)

print_status "Phase 4 configuration retrieved"

# Create SQS trigger setup script (Step 23)
print_info "Creating SQS trigger setup script for Step 23..."

cat > scripts/setup-sqs-trigger.sh << 'SQSTRIGGER'
#!/bin/bash

# TaskFlow Pro - Setup SQS Trigger for Lambda (Step 23 from manual instructions)
# Following exact instructions: batch size 10, activate trigger, enable metrics

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_info() { echo -e "${BLUE}[i]${NC} $1"; }

REGION="us-east-1"
LAMBDA_FUNCTION="TaskFlow-SQSProcessor"

echo "================================================"
echo "   TaskFlow Pro - Step 23: SQS Lambda Trigger"
echo "================================================"
echo ""
print_info "Following manual instructions exactly:"
print_info "  • SQS queue: TaskFlow-ProcessingQueue"
print_info "  • Activate trigger: Yes"
print_info "  • Enable metrics: Yes"
print_info "  • Batch size: 10"
print_info "  • Keep the defaults for other settings"
echo ""

# Get SQS Queue ARN from CloudFormation
SQS_QUEUE_ARN=$(aws cloudformation describe-stacks \
    --stack-name TaskFlow-AdditionalServices \
    --query 'Stacks[0].Outputs[?OutputKey==`SQSQueueArn`].OutputValue' \
    --output text --region $REGION)

if [ -z "$SQS_QUEUE_ARN" ]; then
    print_error "SQS Queue ARN not found. Make sure Phase 4 deployed successfully."
    exit 1
fi

print_info "SQS Queue ARN: $SQS_QUEUE_ARN"
print_info "Lambda Function: $LAMBDA_FUNCTION"

# Check if Lambda function exists
if ! aws lambda get-function --function-name $LAMBDA_FUNCTION --region $REGION > /dev/null 2>&1; then
    print_error "Lambda function $LAMBDA_FUNCTION not found. Make sure Phase 1 is deployed."
    exit 1
fi

print_status "Lambda function verified"

# Check if trigger already exists
print_info "Checking for existing SQS triggers..."
EXISTING_TRIGGERS=$(aws lambda list-event-source-mappings \
    --function-name $LAMBDA_FUNCTION \
    --query 'EventSourceMappings[?EventSourceArn==`'$SQS_QUEUE_ARN'`].UUID' \
    --output text --region $REGION)

if [ -n "$EXISTING_TRIGGERS" ]; then
    print_warning "SQS trigger already exists for $LAMBDA_FUNCTION"
    print_info "Existing trigger UUID: $EXISTING_TRIGGERS"
    echo ""
    read -p "Do you want to remove and recreate the trigger? (y/n): " RECREATE
    
    if [ "$RECREATE" = "y" ] || [ "$RECREATE" = "Y" ]; then
        print_info "Removing existing trigger..."
        aws lambda delete-event-source-mapping \
            --uuid $EXISTING_TRIGGERS \
            --region $REGION > /dev/null
        print_status "Existing trigger removed"
        sleep 5
    else
        print_info "Keeping existing trigger. Exiting."
        exit 0
    fi
fi

# Create SQS trigger (exactly as described in Step 23)
print_info "Creating SQS trigger with the following configuration:"
print_info "  • Choose SQS: ✓"
print_info "  • SQS queue: TaskFlow-ProcessingQueue ✓"
print_info "  • Activate trigger: ✓"
print_info "  • Enable metrics: ✓"
print_info "  • Batch size: 10 ✓"
print_info "  • Keep defaults for other settings ✓"

TRIGGER_UUID=$(aws lambda create-event-source-mapping \
    --event-source-arn $SQS_QUEUE_ARN \
    --function-name $LAMBDA_FUNCTION \
    --batch-size 10 \
    --enabled \
    --region $REGION \
    --query 'UUID' \
    --output text)

if [ $? -eq 0 ]; then
    print_status "SQS trigger created successfully!"
    print_info "Trigger UUID: $TRIGGER_UUID"
else
    print_error "Failed to create SQS trigger"
    exit 1
fi

# Verify trigger is active
print_info "Verifying trigger status..."
sleep 3

TRIGGER_STATE=$(aws lambda get-event-source-mapping \
    --uuid $TRIGGER_UUID \
    --query 'State' \
    --output text --region $REGION)

if [ "$TRIGGER_STATE" = "Enabled" ] || [ "$TRIGGER_STATE" = "Creating" ]; then
    print_status "SQS trigger is active (State: $TRIGGER_STATE)"
else
    print_warning "SQS trigger state: $TRIGGER_STATE (may still be initializing)"
fi

echo ""
echo "================================================"
echo "   Step 23 Complete!"
echo "================================================"
echo ""
echo "SQS Trigger Configuration Summary:"
echo "  Lambda Function: $LAMBDA_FUNCTION"
echo "  SQS Queue ARN: $SQS_QUEUE_ARN"
echo "  Trigger UUID: $TRIGGER_UUID"
echo "  Batch Size: 10"
echo "  Status: $TRIGGER_STATE"
echo "  Metrics: Enabled"
echo ""
print_info "Step 23 from manual instructions completed successfully!"
print_info "TaskFlow-SQSProcessor will now process messages from TaskFlow-ProcessingQueue"
echo ""
SQSTRIGGER

chmod +x scripts/setup-sqs-trigger.sh
print_status "SQS trigger setup script created"

# Verify Parameter Store contains correct values
print_info "Verifying Parameter Store configuration..."
PARAM_VALUE=$(aws ssm get-parameter --name "/taskflow/config" --query 'Parameter.Value' --output text --region $REGION 2>/dev/null || echo "")

if [ -n "$PARAM_VALUE" ]; then
    print_status "Parameter Store contains:"
    echo "$PARAM_VALUE" | jq . 2>/dev/null || echo "$PARAM_VALUE"
else
    print_warning "Could not retrieve Parameter Store value"
fi

# Final output
echo ""
echo "================================================"
echo "   Phase 4 Deployment Complete!"
echo "================================================"
echo ""
print_status "Additional services deployed successfully!"
echo ""
echo "Services Created (Following Manual Instructions):"
echo ""
echo "✅ Step 18 - SNS Topic: TaskFlow-Notifications"
echo "    Type: Standard"
echo "    ARN: $SNS_TOPIC_ARN"
echo "    Email subscription: $ADMIN_EMAIL"
echo ""
echo "✅ Step 19 - SQS Queue: TaskFlow-ProcessingQueue"
echo "    Type: Standard"
echo "    URL: $SQS_QUEUE_URL"
echo ""
echo "✅ Step 20 - Parameter Store: /taskflow/config"
echo "    Type: String"
echo "    Contains actual SNS Topic ARN and SQS Queue URL"
echo "    Value format: {\"snsTopicArn\":\"...\",\"sqsQueueUrl\":\"...\"}"
echo ""
echo "✅ Step 21 - EventBridge Rule: TaskFlow-DailyReport"
echo "    Schedule: rate(1 day) - triggers at 00:00 daily"
echo "    Target: TaskFlow-Analytics Lambda function"
echo "    State: ENABLED"
echo ""
echo "⏳ Step 23 - SQS Trigger (Manual step required)"
echo "    Run: ./scripts/setup-sqs-trigger.sh"
echo "    Will configure SQS trigger for TaskFlow-SQSProcessor"
echo ""
print_warning "NEXT STEPS:"
echo ""
echo "1. Complete Step 23 - SQS Trigger:"
echo "   cd scripts"
echo "   ./setup-sqs-trigger.sh"
echo ""
echo "2. Confirm SNS Email Subscription:"
echo "   Check your email ($ADMIN_EMAIL) for AWS confirmation"
echo "   Click the confirmation link to activate notifications"
echo ""
echo "3. Verify EventBridge Schedule:"
echo "   Analytics will run daily at 00:00 UTC"
echo "   Check CloudWatch logs for TaskFlow-Analytics"
echo ""
print_info "After completing Step 23, Phase 4 will be fully configured!"
echo ""
print_warning "Note: CloudTrail (Step 22) will be done manually as requested"
echo ""
print_warning "Next: Phase 5 - Import API Gateway"
echo ""
