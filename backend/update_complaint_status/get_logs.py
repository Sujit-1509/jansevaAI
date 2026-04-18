import boto3

def get_last_logs(group_name="/aws/lambda/civicai-update-status"):
    client = boto3.client("logs", region_name="ap-south-1")
    streams = client.describe_log_streams(
        logGroupName=group_name,
        orderBy="LastEventTime",
        descending=True,
        limit=1
    )["logStreams"]
    
    if not streams:
        print("No log streams found.")
        return
        
    stream_name = streams[0]["logStreamName"]
    print(f"--- Logs for {stream_name} ---")
    events = client.get_log_events(
        logGroupName=group_name,
        logStreamName=stream_name,
        limit=50
    )["events"]
    
    for event in events:
        print(event["message"].strip())

if __name__ == "__main__":
    get_last_logs()
