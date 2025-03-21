terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_mq_broker" "activemq_broker" {
  broker_name = var.broker_name

  engine_type        = "ActiveMQ"
  engine_version     = "5.18"
  host_instance_type = var.instance_type
  security_groups    = [aws_security_group.mq_security_group.id]
  subnet_ids         = [aws_subnet.mq_subnet.id]
  # Add this line
  auto_minor_version_upgrade = true

  user {
    username = var.mq_username
    password = var.mq_password
  }

  maintenance_window_start_time {
    day_of_week = "SUNDAY"
    time_of_day = "03:00"
    time_zone   = "UTC"
  }

  logs {
    general = true
    audit   = true
  }

  publicly_accessible = false

  tags = {
    Environment = var.environment
  }
}
