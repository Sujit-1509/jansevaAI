$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

Write-Host "Packaging and deploying JanSevaAI-auth..."
cd auth
if (Test-Path auth.zip) { Remove-Item auth.zip }
Compress-Archive -Path lambda_function.py -DestinationPath auth.zip -Force
& $aws lambda update-function-code --function-name JanSevaAI-auth --zip-file fileb://auth.zip | Out-Null
Remove-Item auth.zip
cd ..

Write-Host "Getting execution role from JanSevaAI-auth..."
$roleArn = & $aws lambda get-function --function-name JanSevaAI-auth --query "Configuration.Role" --output text

Write-Host "Packaging and deploying JanSevaAI-manage-workers..."
cd manage_workers
if (Test-Path manage_workers.zip) { Remove-Item manage_workers.zip }
Compress-Archive -Path lambda_function.py -DestinationPath manage_workers.zip -Force

try {
    $exists = & $aws lambda get-function --function-name JanSevaAI-manage-workers 2>$null
    $isNew = $false
} catch {
    $isNew = $true
}

if ($isNew) {
    Write-Host "Creating new JanSevaAI-manage-workers lambda..."
    & $aws lambda create-function --function-name JanSevaAI-manage-workers --runtime python3.12 --role $roleArn --handler lambda_function.lambda_handler --zip-file fileb://manage_workers.zip --timeout 15 | Out-Null
    
    # Wait for creation
    Start-Sleep -Seconds 3
    
    # Set Env vars (so it knows the WORKERS_TABLE_NAME)
    & $aws lambda update-function-configuration --function-name JanSevaAI-manage-workers --environment "Variables={REGION=ap-south-1,TABLE_NAME=Workers}" | Out-Null
    
    # Give API Gateway permission to trigger it
    $account = ($roleArn -split ':')[4]
    & $aws lambda add-permission --function-name JanSevaAI-manage-workers --statement-id apigateway-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:ap-south-1:$account:r9qaeyrgf9/*" | Out-Null
} else {
    Write-Host "Updating existing JanSevaAI-manage-workers lambda..."
    & $aws lambda update-function-code --function-name JanSevaAI-manage-workers --zip-file fileb://manage_workers.zip | Out-Null
}
Remove-Item manage_workers.zip
cd ..

Write-Host "Deployment complete!"
