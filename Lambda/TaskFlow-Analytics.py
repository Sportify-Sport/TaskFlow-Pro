import json
import boto3
from datetime import datetime
from collections import defaultdict

dynamodb = boto3.resource('dynamodb')
tasks_table = dynamodb.Table('TaskFlow-Tasks')
analytics_table = dynamodb.Table('TaskFlow-Analytics')

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    # Check if this is from EventBridge
    if 'source' in event and event['source'] == 'aws.events':
        # EventBridge trigger - no auth needed
        stats = calculate_stats()
        print(f"Daily analytics calculated: {json.dumps(stats, default=str)}")
        return stats
    
    # API Gateway request - check admin access
    if 'requestContext' not in event:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Invalid request'})
        }
    
    # Verify admin access for API requests
    claims = event['requestContext']['authorizer']['claims']
    groups = claims.get('cognito:groups', '').split(',')
    
    if 'admins' not in groups:
        return {
            'statusCode': 403,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': 'Access denied'})
        }
    
    # Calculate statistics
    stats = calculate_stats()
    
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(stats, default=str)
    }


def calculate_stats():
    # Scan all tasks
    response = tasks_table.scan()
    tasks = response['Items']
    
    stats = {
        'totalTasks': len(tasks),
        'tasksByStatus': defaultdict(int),
        'tasksByPriority': defaultdict(int),
        'tasksByUser': defaultdict(int),
        'recentTasks': []
    }
    
    for task in tasks:
        stats['tasksByStatus'][task.get('status', 'unknown')] += 1
        stats['tasksByPriority'][task.get('priority', 'unknown')] += 1
        stats['tasksByUser'][task.get('userEmail', 'unknown')] += 1
    
    # Get recent tasks
    sorted_tasks = sorted(tasks, key=lambda x: x.get('createdAt', ''), reverse=True)
    stats['recentTasks'] = sorted_tasks[:10]
    
    # Convert defaultdicts to regular dicts
    stats['tasksByStatus'] = dict(stats['tasksByStatus'])
    stats['tasksByPriority'] = dict(stats['tasksByPriority'])
    stats['tasksByUser'] = dict(stats['tasksByUser'])
    
    # Store in analytics table
    analytics_table.put_item(Item={
        'date': datetime.utcnow().strftime('%Y-%m-%d'),
        'metric': 'daily_stats',
        'timestamp': datetime.utcnow().isoformat(),
        'stats': stats
    })
    
    return stats
