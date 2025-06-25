# TaskFlow Pro - Manual Configuration Steps

## After Phase 1 & 2

### Verify Deployment
1. Lambda Functions:
   - Go to Lambda Console
   - Verify 5 functions exist
   - Check each has environment variables

2. DynamoDB Tables:
   - Go to DynamoDB Console
   - Verify TaskFlow-Tasks and TaskFlow-Analytics exist

3. S3 Website:
   - Access the website URL
   - Check all pages load correctly

### Prepare for Phase 3 (Cognito)

1. Note your S3 website URL for Cognito callback URLs
2. Ensure Lambda functions for Cognito triggers are deployed
3. Have Gmail account ready for testing

### Configuration Notes

The config.js file has been created with:
- Domain without https:// as required
- Placeholders for Cognito values
- Correct redirect URI format
- Region set to us-east-1

## Important URLs

Save these from your deployment output:
- Website URL: https://[bucket].s3-website-us-east-1.amazonaws.com
- Bucket Name: taskflow-website-[student-id]
- Domain (for config.js): [bucket].s3-website-us-east-1.amazonaws.com
