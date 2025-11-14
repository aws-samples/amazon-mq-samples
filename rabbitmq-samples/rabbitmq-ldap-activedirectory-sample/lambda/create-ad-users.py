import boto3
import json
import time

def handler(event, context):
    print(f"Lambda invoked with event: {json.dumps(event)}")
    print(f"Request type: {event.get('RequestType', 'Unknown')}")
    
    try:
        if event['RequestType'] == 'Create' or event['RequestType'] == 'Update':
            username = event['ResourceProperties']['Username']
            directory_id = event['ResourceProperties']['DirectoryId']
            secret_arn = event['ResourceProperties'].get('SecretArn')
            
            ds_client = boto3.client('ds')
            ds_data_client = boto3.client('ds-data')
            
            # Wait for directory to be active
            print(f"Waiting for directory {directory_id} to be active...")
            max_attempts = 20
            directory_active = False
            
            for attempt in range(max_attempts):
                try:
                    response = ds_client.describe_directories(DirectoryIds=[directory_id])
                    status = response['DirectoryDescriptions'][0]['Stage']
                    print(f"Directory status: {status}")
                    
                    if status == 'Active':
                        directory_active = True
                        break
                    elif status in ['Failed', 'Deleted']:
                        print(f"Directory is in {status} state, skipping user creation")
                        break
                    
                    time.sleep(30)
                except Exception as e:
                    print(f"Error checking directory status: {str(e)}")
                    time.sleep(30)
            
            # Try to create user only if directory is active
            user_created = False
            if directory_active:
                try:
                    # First enable directory data access with retry logic
                    for attempt in range(3):
                        try:
                            print("Enabling directory data access...")
                            ds_client.enable_directory_data_access(DirectoryId=directory_id)
                            print("Directory data access enabled")
                            break
                        except Exception as e:
                            if 'status change is currently in progress' in str(e) and attempt < 2:
                                print(f"Directory data access change in progress, waiting 60 seconds (attempt {attempt + 1})")
                                time.sleep(60)
                            elif 'already enabled' in str(e) or 'InvalidDirectoryState' in str(e):
                                print("Directory data access already enabled")
                                break
                            else:
                                print(f"Note: Could not enable directory data access: {str(e)}")
                                break
                    
                    # Wait for the feature to be fully enabled
                    print("Waiting for directory data access to be ready...")
                    time.sleep(120)
                    
                except Exception as e:
                    print(f"Note: Could not enable directory data access (may already be enabled): {str(e)}")
                
                # Create groups first (independent of user creation) with retry logic
                for attempt in range(5):
                    try:
                        ds_data_client.create_group(
                            DirectoryId=directory_id,
                            SAMAccountName='RabbitMqAdministrators',
                            GroupType='Security'
                        )
                        print("Created RabbitMqAdministrators group")
                        break
                    except Exception as e:
                        if 'Group already exists' in str(e) or 'ConflictException' in str(e):
                            print("Group RabbitMqAdministrators already exists")
                            break
                        elif ('DS Data feature is being enabled' in str(e) or 
                              'DS Data feature is not enabled' in str(e)) and attempt < 4:
                            print(f"DS Data feature not ready, waiting 30 seconds (attempt {attempt + 1})")
                            time.sleep(30)
                        else:
                            print(f"Failed to create RabbitMqAdministrators group: {str(e)}")
                            break
                
                for attempt in range(5):
                    try:
                        ds_data_client.create_group(
                            DirectoryId=directory_id,
                            SAMAccountName='RabbitMqMonitoringUsers',
                            GroupType='Security'
                        )
                        print("Created RabbitMqMonitoringUsers group")
                        break
                    except Exception as e:
                        if 'Group already exists' in str(e) or 'ConflictException' in str(e):
                            print("Group RabbitMqMonitoringUsers already exists")
                            break
                        elif ('DS Data feature is being enabled' in str(e) or 
                              'DS Data feature is not enabled' in str(e)) and attempt < 4:
                            print(f"DS Data feature not ready, waiting 30 seconds (attempt {attempt + 1})")
                            time.sleep(30)
                        else:
                            print(f"Failed to create RabbitMqMonitoringUsers group: {str(e)}")
                            break
                
                try:
                    # Create user first
                    response = ds_data_client.create_user(
                        DirectoryId=directory_id,
                        SAMAccountName=username,
                        GivenName=username,
                        Surname='User'
                    )
                    print(f"User {username} created successfully")
                except Exception as e:
                    if 'User already exists' in str(e) or 'EntityAlreadyExists' in str(e):
                        print(f"User {username} already exists, continuing...")
                    else:
                        print(f"Warning: Failed to create user {username}: {str(e)}")
                        print("Continuing without user creation")
                        user_created = False
                
                try:
                    # Get password from existing secret
                    if secret_arn:
                        print(f"Retrieving password from secret: {secret_arn}")
                        secrets_client = boto3.client('secretsmanager')
                        response = secrets_client.get_secret_value(SecretId=secret_arn)
                        password = response['SecretString']
                        print(f"Using password from secret (length: {len(password)})")
                    else:
                        print("No secret ARN provided, cannot set password")
                        return {
                            'PhysicalResourceId': f'user-{username}',
                            'Data': {
                                'UserDN': f"CN={username},CN=Users,DC=rabbitmq-ldap,DC=tutorial,DC=local",
                                'UserCreated': 'false',
                                'Error': 'No secret ARN provided'
                            }
                        }
                    
                    # Set password (this also enables the user)
                    ds_client.reset_user_password(
                        DirectoryId=directory_id,
                        UserName=username,
                        NewPassword=password
                    )
                    
                    print(f"Password set for user {username}")
                    user_created = True
                    
                    # Add RabbitMqConsoleUser to RabbitMqMonitoringUsers group
                    if username == 'RabbitMqConsoleUser':
                        try:
                            ds_data_client.add_group_member(
                                DirectoryId=directory_id,
                                GroupName='RabbitMqMonitoringUsers',
                                MemberName=username
                            )
                            print(f"Added {username} to RabbitMqMonitoringUsers group")
                        except Exception as e:
                            if 'Member already exists' in str(e) or 'ConflictException' in str(e):
                                print(f"{username} already in RabbitMqMonitoringUsers group")
                            else:
                                print(f"Failed to add user to group: {str(e)}")
                    
                    # Add RabbitMqAmqpUser to RabbitMqAdministrators group
                    if username == 'RabbitMqAmqpUser':
                        try:
                            ds_data_client.add_group_member(
                                DirectoryId=directory_id,
                                GroupName='RabbitMqAdministrators',
                                MemberName=username
                            )
                            print(f"Added {username} to RabbitMqAdministrators group")
                        except Exception as e:
                            if 'Member already exists' in str(e) or 'ConflictException' in str(e):
                                print(f"{username} already in RabbitMqAdministrators group")
                            else:
                                print(f"Failed to add user to group: {str(e)}")
                                
                except ds_client.exceptions.EntityAlreadyExistsException:
                    print(f"User {username} already exists")
                    user_created = True
                except Exception as e:
                    print(f"Warning: Failed to create user {username}: {str(e)}")
                    print("Continuing without user creation")
            else:
                print("Directory not active, skipping user creation")
            
            # Always return success with FQDN
            user_dn = f"CN={username},CN=Users,DC=rabbitmq-ldap,DC=tutorial,DC=local"
            
            return {
                'PhysicalResourceId': f'user-{username}',
                'Data': {
                    'UserDN': user_dn,
                    'UserCreated': str(user_created)
                }
            }
        
        elif event['RequestType'] == 'Delete':
            username = event['ResourceProperties']['Username']
            directory_id = event['ResourceProperties']['DirectoryId']
            
            try:
                ds_data_client = boto3.client('ds-data')
                ds_data_client.delete_user(
                    DirectoryId=directory_id,
                    SAMAccountName=username
                )
                print(f"User {username} deleted successfully")
                return {'PhysicalResourceId': event.get('PhysicalResourceId', 'user')}
            except Exception as e:
                print(f"Failed to delete user {username}: {str(e)}")
                raise e
            
        # Always return success for other operations
        return {'PhysicalResourceId': event.get('PhysicalResourceId', 'user')}
        
    except Exception as e:
        # Only always succeed on CREATE to avoid AD deletion and recreation
        # UPDATE and DELETE should fail properly if there are real issues
        if event.get('RequestType') == 'Create':
            print(f"Warning: Custom resource encountered error on CREATE: {str(e)}")
            username = event.get('ResourceProperties', {}).get('Username', 'unknown')
            user_dn = f"CN={username},CN=Users,DC=rabbitmq-ldap,DC=tutorial,DC=local"
            
            return {
                'PhysicalResourceId': f'user-{username}',
                'Data': {
                    'UserDN': user_dn,
                    'UserCreated': 'false',
                    'Error': str(e)
                }
            }
        else:
            # For UPDATE and DELETE, let the error propagate
            print(f"Custom resource failed on {event.get('RequestType', 'Unknown')}: {str(e)}")
            raise e
