$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

function Deploy-Lambda($folder, $funcName) {
    Write-Host "--- Deploying $funcName from $folder ---"
    cd $folder
    $zipFile = "$funcName.zip"
    if (Test-Path $zipFile) { Remove-Item $zipFile }
    
    # For process_image, we need multiple files
    if ($folder.EndsWith("process_image")) {
        Compress-Archive -Path *.py -DestinationPath $zipFile -Force
    } else {
        Compress-Archive -Path lambda_function.py -DestinationPath $zipFile -Force
    }
    
    & $aws lambda update-function-code --function-name $funcName --zip-file "fileb://$zipFile" | Out-Null
    Remove-Item $zipFile
    cd ..\..
    Write-Host "Done $funcName"
}

Write-Host "Starting Master Deployment..."

# List of folder to function mappings
Deploy-Lambda "backend/update_complaint_status" "civicai-update-status"
Deploy-Lambda "backend/manage_workers" "civicai-manage-workers"
Deploy-Lambda "backend/process_image" "process_image"
Deploy-Lambda "backend/submit_complaint" "civicai-submit-complaint"
Deploy-Lambda "backend/auth" "civicai-auth"
Deploy-Lambda "backend/bulk_update" "civicai-bulk-update"

Write-Host "All specified Lambdas deployed successfully!"
