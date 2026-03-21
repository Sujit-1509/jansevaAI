import boto3
import logging
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

dynamodb = boto3.client('dynamodb', region_name='ap-south-1')
table_name = 'Workers'

def create_table():
    try:
        response = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {'AttributeName': 'phone', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'phone', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        logger.info(f"Creating table {table_name}...")
        waiter = dynamodb.get_waiter('table_exists')
        waiter.wait(TableName=table_name)
        logger.info(f"Table {table_name} created successfully!")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            logger.info(f"Table {table_name} already exists.")
        else:
            logger.error(f"Failed to create table: {e}")

if __name__ == '__main__':
    create_table()
