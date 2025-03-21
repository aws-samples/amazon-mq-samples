variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "broker_name" {
  description = "Name of the MQ broker"
  type        = string
  default     = "my-activemq-broker"
}

variable "instance_type" {
  description = "Instance type for the MQ broker"
  type        = string
  default     = "mq.t3.micro"
}

variable "mq_username" {
  description = "Username for the MQ broker"
  type        = string
}

variable "mq_password" {
  description = "Password for the MQ broker"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "dev"
}