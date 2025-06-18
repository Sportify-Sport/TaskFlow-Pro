import json
import boto3

def lambda_handler(event, context):
    # Get the user pool ID and username from the event
    user_pool_id = event['userPoolId']
    username = event['userName']
    
    # Create Cognito client
    cognito = boto3.client('cognito-idp')
    
    try:
        # Add user to 'users' group
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=username,
            GroupName='users'
        )
        print(f"Successfully added {username} to users group")
    except Exception as e:
        print(f"Error adding user to group: {str(e)}")
        # Don't fail the trigger
    
    # Return the event to continue
    return event
