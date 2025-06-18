import json

def lambda_handler(event, context):
    # Get user attributes from the event
    user_attributes = event['request']['userAttributes']
    email = user_attributes.get('email', '')
    
    # Check if email is from gmail.com
    if not email.endswith('@gmail.com'):
        # Reject non-Gmail users
        raise Exception('Registration is restricted to Gmail users only. Please use a @gmail.com email address.')
    
    # Return the event to continue registration
    return event
