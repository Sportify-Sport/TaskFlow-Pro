# TaskFlow Pro - Installation Guide

## Prerequisites
- AWS Academy Lab access with LabRole
- AWS CLI configured
- Bash shell (Linux/Mac/WSL)

## Phase 1 & 2 Deployment

### Quick Start
```bash
unzip TaskFlow-Pro.zip
cd TaskFlow-Pro
chmod +x scripts/*.sh
./scripts/deploy-phases-1-2.sh
```

### Phase 3
## Manual Instructions for cognito
## Setup Cognito User Pool
1.	Go to Cognito Console 
2.	User Pool
3.	Create User Pool
    a.	Choose SPA
    b.	Name: TaskFlowWebApp
    c.	Sign-in: email
    d.	Sign-up: email, name
    e.	Return Url put the link from S3 to index.html
    f.	Create
4.	Click at User Pool that was just created
    a.	Click Rename
    b.	Rename to: TaskFlowUserPool
5.	Click at TaskFlowWebApp
    a.	Login Pages
    b.	At Managed Login Pages Configuration Click Edit
    c.	For Sign-out URL put the link from S3 to index.html
    d.	At OpenId Connect Scopes Choose: openid, email, profile
6.	Click at Groups
    a.	For Every Group choose LabRole
    b.	Create
    i.	Name: users, Description: “Regular users”
    c.	Create
    i.	Name: admins, Description: “Administrator users”

## Add Post Confirmation Trigger:
1.	Go back to Cognito User Pool
2.	Go to Extensions
3.	Click "Add Lambda trigger"
4.	Trigger type: Post confirmation
5.	Lambda function: TaskFlow-AutoAssignGroup
6.	Click "Add Lambda trigger"
## Add Pre sign-up Trigger:
1.	Go back to Cognito User Pool
2.	Go to Extensions
3.	Click "Add Lambda trigger"
4.	Trigger type: Pre sign-up
5.	Lambda function: TaskFlow-PreSignupValidation
6.	Click "Add Lambda trigger"


### Create Test Users
## Create Admin User:
1.	In Cognito User Pool, go to "Users" tab
2.	Click "Create user"
3.	User information:
      o	Don't send an invitation (The default one)
      o	Email: admin@gmail.com
      o	Set password as: 123456aA!
4.	Click "Create user"
5.	Click at the User -> edit -> Update the name to be the same as the email
6.	Go to user details or Click at the User, Groups tab
7.	Add to group: admins
## Create Regular User:
1.	Create another user:
      o	Don't send an invitation (The default one)
      o	Email: user@gmail.com
      o	Set password as: 123456aA!
2.	Click "Create user"
3.	Click at the User -> edit -> Update the name to be the same as the email
4.	Go to user details or Click at the User, Groups tab
5.	Add to group: users

# Phase 4
1. chmod +x scripts/phase4-deploy.sh
2. ./scripts/phase4-deploy.sh your-email@gmail.com

3. Confirm SNS Email Subscription
4. Check your email for AWS SNS subscription confirmation
5. Click the confirmation link
6. You should see "Subscription confirmed!"

# Setup CloudTrail
1.	Go to CloudTrail Console
2.	Create trail:
    o	Name: TaskFlow-Trail
    o	Storage: Create new S3 bucket

## Setup Trigger
1.	Go to your lambda console, click at TaskFlow-SQSProcessor 
2.	Click at Configuration
3.	Click at Triggers
4.	Add Trigger
  a.	Choose SQS
  b.	SQS queue: TaskFlow-ProcessingQueue
  c.	Choose: Activate trigger, Enable metrics
  d.	Batch size: 10
  e.	Keep the defaults
  f.	Click Add



## API Gateway
1. Go to API Gateway Console 
2. Click at APIs
3. Click Create API
4. Click REST API
5. Import API
6. Choose File (Found inside api-gateway folder) -> TaskFlowAPI-prod-swagger-apigateway.yaml
7. Create API
8. Click at the API that you just created
9. Click at Deploy
10. New stage: prod
11. Click Deploy

## Update config.js
1.	Get your S3 website URL from S3 bucket properties
2. Get the domain for the cognito
3. Get the app client Id
4. Get the api endpoint
6. Download config.js from the S3 bucket
7.	Update js/config.js:
const config = {
    cognito: {
        domain: 'domain.auth.us-east-1.amazoncognito.com',
        clientId: '[YOUR-CLIENT-ID]',
        redirectUri: 'https://[YOUR-S3-WEBSITE-URL]/index.html',
        region: 'us-east-1'
    },
    api: {
        endpoint: ''
    }
};

8.	Re-upload config.js to S3
(For the domain provide the Url without https://), (It comes by default with https://)
(The cognito domain is the default one, not a custom domain)