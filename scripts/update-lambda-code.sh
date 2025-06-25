#!/bin/bash

# Update Lambda functions with actual code from lambda directory

set -e

REGION="us-east-1"
SCRIPT_DIR=$(pwd)
LAMBDA_DIR="$SCRIPT_DIR/lambda"
echo "Updating Lambda functions with actual code..."

update_lambda() {
    local function_name=$1
    local source_file=$2
    
    echo "  Updating $function_name..."
    
    # Create temporary directory
    temp_dir=$(mktemp -d)
    cd $temp_dir

    # Copy source file as lambda_function.py
    cp $LAMBDA_DIR/$source_file lambda_function.py
    
    # Create zip
    zip -q deployment.zip lambda_function.py
    
    # Update Lambda function
    aws lambda update-function-code \
        --function-name $function_name \
        --zip-file fileb://deployment.zip \
        --region $REGION > /dev/null
    
    # Cleanup
    cd - > /dev/null
    rm -rf $temp_dir
    
    echo "    ✓ $function_name updated"
}

# Update all Lambda functions
update_lambda "TaskFlow-TaskHandler" "TaskFlow-TaskHandler.py"
update_lambda "TaskFlow-Analytics" "TaskFlow-Analytics.py"
update_lambda "TaskFlow-SQSProcessor" "TaskFlow-SQSProcessor.py"
update_lambda "TaskFlow-PreSignupValidation" "TaskFlow-PreSignupValidation.py"
update_lambda "TaskFlow-AutoAssignGroup" "TaskFlow-AutoAssignGroup.py"

echo "✓ All Lambda functions updated successfully"
