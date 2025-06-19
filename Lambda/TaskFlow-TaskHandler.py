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
        elif path == '/tasks/bulk-import' and http_method == 'POST':
            return bulk_import_tasks(event['body'], user_id, user_email)
        elif path.startswith('/tasks/') and http_method == 'PUT':
            task_id = path.split('/')[-1]
            return update_task(event['body'], task_id, user_id, is_admin)
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

def bulk_import_tasks(body, user_id, user_email):
    """Queue tasks for bulk import via SQS"""
    data = json.loads(body)
    tasks = data.get('tasks', [])
    
    if not tasks:
        return response(400, {'error': 'No tasks provided'})
    
    # Get SQS URL from Parameter Store
    config = get_config()
    if not config or 'sqsQueueUrl' not in config:
        return response(500, {'error': 'SQS configuration not found'})
    
    sqs = boto3.client('sqs')
    
    # Send to SQS in batches of 10 (SQS limit)
    batch_size = 10
    total_sent = 0
    
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i + batch_size]
        entries = []
        
        for j, task in enumerate(batch):
            entries.append({
                'Id': str(j),
                'MessageBody': json.dumps({
                    'action': 'create_task',
                    'userId': user_id,
                    'userEmail': user_email,
                    'task': task
                })
            })
        
        try:
            sqs.send_message_batch(
                QueueUrl=config['sqsQueueUrl'],
                Entries=entries
            )
            total_sent += len(entries)
        except Exception as e:
            print(f"Error sending batch to SQS: {e}")

    # Send SNS notification to admin about the import
    if config and 'snsTopicArn' in config and total_sent > 0:
        try:
            sns.publish(
                TopicArn=config['snsTopicArn'],
                Subject='CSV Import Started - Admin Alert',
                Message=f"""
CSV Import Alert for Administrators

User: {user_email}
Number of tasks queued: {total_sent}
Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

The tasks are being processed and will be available shortly.
                """
            )
            print(f"Admin notification sent for CSV import by {user_email}")
        except Exception as e:
            print(f"Admin notification failed: {e}")
    return response(202, {
        'message': f'Successfully queued {total_sent} tasks for import',
        'total': total_sent
    })

def update_task(body, task_id, user_id, is_admin):
    data = json.loads(body)
    
    # First, get the existing task to verify ownership
    if is_admin:
        # Admin can update any task
        scan_result = tasks_table.scan(
            FilterExpression='taskId = :tid',
            ExpressionAttributeValues={':tid': task_id}
        )
        if not scan_result['Items']:
            return response(404, {'error': 'Task not found'})
        existing_task = scan_result['Items'][0]
        task_user_id = existing_task['userId']
    else:
        # Regular users can only update their own tasks
        result = tasks_table.query(
            KeyConditionExpression='userId = :uid AND taskId = :tid',
            ExpressionAttributeValues={
                ':uid': user_id,
                ':tid': task_id
            }
        )
        if not result['Items']:
            return response(404, {'error': 'Task not found'})
        existing_task = result['Items'][0]
        task_user_id = user_id
    
    # Prepare update expression
    update_expr = []
    expr_attr_values = {}
    
    if 'status' in data:
        update_expr.append('#status = :status')
        expr_attr_values[':status'] = data['status']
        expr_attr_names = {'#status': 'status'}  # status might be a reserved word
    else:
        expr_attr_names = {}
    
    if 'title' in data:
        update_expr.append('title = :title')
        expr_attr_values[':title'] = data['title']
    
    if 'description' in data:
        update_expr.append('description = :description')
        expr_attr_values[':description'] = data['description']
    
    if 'priority' in data:
        update_expr.append('priority = :priority')
        expr_attr_values[':priority'] = data['priority']
    
    if 'dueDate' in data:
        update_expr.append('dueDate = :dueDate')
        expr_attr_values[':dueDate'] = data['dueDate']
    
    # Add updatedAt timestamp
    update_expr.append('updatedAt = :updatedAt')
    expr_attr_values[':updatedAt'] = datetime.utcnow().isoformat()
    
    # Update the task
    update_params = {
        'Key': {'userId': task_user_id, 'taskId': task_id},
        'UpdateExpression': 'SET ' + ', '.join(update_expr),
        'ExpressionAttributeValues': expr_attr_values
    }

    if expr_attr_names:
        update_params['ExpressionAttributeNames'] = expr_attr_names
    
    tasks_table.update_item(**update_params)

    return response(200, {'message': 'Task updated successfully'})