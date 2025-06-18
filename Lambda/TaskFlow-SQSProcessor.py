import json
import boto3
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
tasks_table = dynamodb.Table('TaskFlow-Tasks')
sns = boto3.client('sns')
ssm = boto3.client('ssm')

def get_config():
    """Get configuration from Parameter Store"""
    try:
        response = ssm.get_parameter(Name='/taskflow/config')
        return json.loads(response['Parameter']['Value'])
    except Exception as e:
        print(f"Error getting config: {e}")
        return None

def lambda_handler(event, context):
    """Process messages from SQS queue"""
    print(f"Processing {len(event['Records'])} messages")
    
    created_count = 0
    failed_count = 0
    
    for record in event['Records']:
        try:
            message = json.loads(record['body'])
            
            if message.get('action') == 'create_task':
                if create_task_from_queue(message):
                    created_count += 1
                else:
                    failed_count += 1
                    
        except Exception as e:
            print(f"Error processing message: {e}")
            failed_count += 1
    
    print(f"Created {created_count} tasks, {failed_count} failed")
    
    # Send completion notification if all done
    if created_count > 0:
        send_completion_notification(created_count, message.get('userEmail', ''))
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'created': created_count,
            'failed': failed_count
        })
    }

def create_task_from_queue(message):
    """Create a single task from queue message"""
    try:
        user_id = message['userId']
        user_email = message['userEmail']
        task_data = message['task']
        
        task_id = str(uuid.uuid4())
        
        item = {
            'userId': user_id,
            'taskId': task_id,
            'title': task_data.get('title', 'Untitled Task'),
            'description': task_data.get('description', ''),
            'priority': task_data.get('priority', 'medium'),
            'dueDate': task_data.get('dueDate', ''),
            'status': 'pending',
            'createdAt': datetime.utcnow().isoformat(),
            'userEmail': user_email
        }
        
        tasks_table.put_item(Item=item)
        print(f"Created task: {task_id} - {item['title']}")
        return True
        
    except Exception as e:
        print(f"Error creating task: {e}")
        return False

def send_completion_notification(count, user_email):
    """Send notification when import is complete"""
    config = get_config()
    if config and 'snsTopicArn' in config:
        try:
            sns.publish(
                TopicArn=config['snsTopicArn'],
                Subject='Task Import Complete',
                Message=f"""
Task import completed successfully!

Imported {count} tasks for {user_email}

You can now view your tasks in TaskFlow Pro.
                """
            )
        except Exception as e:
            print(f"Error sending notification: {e}")
