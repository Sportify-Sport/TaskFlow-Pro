import json
import boto3
import uuid
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
tasks_table = dynamodb.Table('TaskFlow-Tasks')

# Initialize clients
sns = boto3.client('sns')
ssm = boto3.client('ssm')

# Cache for parameter store values
config_cache = None

def get_config():
    """Retrieve configuration from Parameter Store with caching"""
    global config_cache
    
    # Return cached value if available
    if config_cache:
        return config_cache
    
    try:
        # Get parameter from Systems Manager
        response = ssm.get_parameter(Name='/taskflow/config')
        config_cache = json.loads(response['Parameter']['Value'])
        return config_cache
    except Exception as e:
        print(f"Error retrieving config: {e}")
        return None

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    # Extract user info
    claims = event['requestContext']['authorizer']['claims']
    user_id = claims['sub']
    user_email = claims['email']
    groups = claims.get('cognito:groups', '').split(',')
    is_admin = 'admins' in groups
    
    http_method = event['httpMethod']
    path = event['path']
    
    try:
        if path == '/tasks' and http_method == 'GET':
            return get_tasks(user_id, is_admin)
        elif path == '/tasks' and http_method == 'POST':
            return create_task(event['body'], user_id, user_email)
        elif path.startswith('/tasks/') and http_method == 'DELETE':
            task_id = path.split('/')[-1]
            return delete_task(task_id, user_id, is_admin)
        else:
            return response(404, {'error': 'Not found'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return response(500, {'error': str(e)})

def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, default=str)
    }

def get_tasks(user_id, is_admin):
    if is_admin:
        # Admin sees all tasks
        result = tasks_table.scan()
    else:
        # Users see only their tasks
        result = tasks_table.query(
            KeyConditionExpression='userId = :uid',
            ExpressionAttributeValues={':uid': user_id}
        )
    
    return response(200, result['Items'])

def create_task(body, user_id, user_email):
    data = json.loads(body)
    task_id = str(uuid.uuid4())
    
    item = {
        'userId': user_id,
        'taskId': task_id,
        'title': data['title'],
        'description': data.get('description', ''),
        'priority': data.get('priority', 'medium'),
        'dueDate': data.get('dueDate', ''),
        'status': 'pending',
        'createdAt': datetime.utcnow().isoformat(),
        'userEmail': user_email
    }
    
    tasks_table.put_item(Item=item)
    
    # Send SNS notification using Parameter Store config
    config = get_config()
    if config and 'snsTopicArn' in config:
        try:
            sns.publish(
                TopicArn=config['snsTopicArn'],
                Subject='New Task Created',
                Message=f"User {user_email} created a new task: {data['title']}\nPriority: {data.get('priority', 'medium')}\nDescription: {data.get('description', 'No description')}"
            )
            print(f"SNS notification sent for task: {task_id}")
        except Exception as e:
            print(f"SNS notification failed: {e}")
            # Don't fail the task creation if notification fails
    else:
        print("SNS configuration not found in Parameter Store")
    
    return response(201, item)

def delete_task(task_id, user_id, is_admin):
    if is_admin:
        # Admin can delete any task - need to find it first
        scan_result = tasks_table.scan(
            FilterExpression='taskId = :tid',
            ExpressionAttributeValues={':tid': task_id}
        )
        if scan_result['Items']:
            item = scan_result['Items'][0]
            tasks_table.delete_item(
                Key={'userId': item['userId'], 'taskId': task_id}
            )
        else:
            return response(404, {'error': 'Task not found'})
    else:
        # Users can only delete their own tasks
        tasks_table.delete_item(
            Key={'userId': user_id, 'taskId': task_id}
        )
    
    return response(200, {'message': 'Task deleted'})
