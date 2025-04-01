# Amazon MQ Terraform Configuration

This Terraform configuration creates an Amazon MQ broker running ActiveMQ with the following components:

- Amazon MQ broker
- VPC with a private subnet
- Security group with required ports for ActiveMQ
- Logging configuration
- Maintenance window configuration

## Prerequisites

- AWS account
- Terraform installed
- AWS credentials configured

## Usage

1. Initialize Terraform:
```bash
terraform init
```

2. Create a `terraform.tfvars` file with your variables:
```hcl
aws_region   = "us-east-1"
broker_name  = "my-activemq-broker"
mq_username  = "admin"
mq_password  = "your-secure-password"
environment  = "dev"
```

3. Review the planned changes:
```bash
terraform plan
```

4. Apply the configuration:
```bash
terraform apply
```

5. To destroy the resources:
```bash
terraform destroy
```

## Security Considerations

- The broker is created in a private subnet
- Security group allows only necessary ports
- Credentials are treated as sensitive values
- Audit logging is enabled

## Outputs

- broker_id: The ID of the MQ broker
- broker_arn: The ARN of the MQ broker
- broker_instances: List of broker instances
- primary_console_url: The URL of the primary web console
